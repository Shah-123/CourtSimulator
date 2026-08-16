"""MLflow tracking for the evaluation harness.

The harness already prints good numbers. What it could not do is answer the
question that actually comes up — *did that change help?* — because every run
went to a terminal and then to nowhere. Comparing two runs meant scrolling back
through a console, and the baselines in `CLAUDE.md` are hand-copied figures
whose provenance is a person's memory of which settings were in effect.

This records each run instead: metrics, the settings that produced them, the
commit, and the full printed report as an artifact. `mlflow ui` then does the
comparison that was previously done by eye.

Three decisions worth keeping:

**Optional, and silent about it.** ``mlflow`` lives in the ``eval`` extra, not
in the service dependencies — the AI service must not gain a tracking library
to serve a request. If the import fails the harness runs exactly as it did
before and says so in one line. An eval that refuses to run because a *logging*
dependency is missing would be a worse harness than one that logs nothing.

**Params come from ``get_settings()``, not from the call site.** Same reasoning
as ``app.telemetry`` wrapping the client rather than the eight call sites: a
comparison between two runs is only meaningful if the settings that differed
were recorded, and the setting somebody forgets to log is the one that moved
the metric. Reading them from the settings object means a new knob is captured
whether or not whoever added it remembered to.

**The printed report is logged alongside the metrics.** The metrics say hit@1
fell to 0.90; only the report says *which query missed*. A tracked run that can
show a regression but not diagnose it would send you back to re-running the
eval at full token cost to find out what happened.

Never let this fail a run. Every MLflow call is guarded — the metrics are worth
real money to produce and losing them to a logging error would be absurd.
"""

from __future__ import annotations

import io
import os
import re
import subprocess
import sys
from collections.abc import Iterator
from contextlib import contextmanager, redirect_stdout
from pathlib import Path

from app.config import REPO_ROOT, get_settings

# A file in the repo tree rather than a tracking server. The alternative needs
# something running before `pnpm run eval` works, which is exactly the kind of
# friction that stops an eval being re-run. Point MLFLOW_TRACKING_URI at a
# server when there is one; nothing here assumes local storage.
#
# SQLite rather than the `./mlruns` file store: MLflow 3 puts the file backend
# in maintenance mode and raises on it unless MLFLOW_ALLOW_FILE_STORE is set.
# Opting out of that would leave the harness on a backend that receives no
# further updates, for no gain.
_SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STORE = f"sqlite:///{(_SERVICE_ROOT / 'mlflow.db').as_posix()}"
DEFAULT_ARTIFACTS = (_SERVICE_ROOT / "mlartifacts").as_uri()
EXPERIMENT = "adalat-eval"

# MLflow rejects metric keys outside [alphanumeric _ - . / space]. `hit@1` is
# the name everyone uses for the metric, so it is translated rather than
# renamed — `hit_at_1` in the UI, `hit@1` everywhere a human reads it.
_KEY_SUBSTITUTIONS = (("@", "_at_"),)
_KEY_INVALID = re.compile(r"[^\w./\- ]")


def _clean_key(key: str) -> str:
    for old, new in _KEY_SUBSTITUTIONS:
        key = key.replace(old, new)
    return _KEY_INVALID.sub("_", key)


def _git(*args: str) -> str:
    try:
        done = subprocess.run(  # noqa: S603 - fixed argv, no shell
            ["git", *args],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return ""
    return done.stdout.strip() if done.returncode == 0 else ""


def _provenance() -> dict[str, object]:
    """What produced this run: the settings that steer it, and the commit."""
    settings = get_settings()
    return {
        "model_text": settings.model_text,
        "model_fast": settings.model_fast,
        "objection_cascade": settings.objection_cascade,
        "reranker_backend": settings.reranker_backend,
        "reranker_model": settings.reranker_model,
        "rrf_k": settings.rrf_k,
        "model_embedding": settings.model_embedding,
        "embedding_dimensions": settings.embedding_dimensions,
        "git_commit": _git("rev-parse", "--short", "HEAD") or "unknown",
        # A dirty tree means the commit does not describe the code that ran.
        # Recording it is the difference between a reproducible number and one
        # that merely looks reproducible.
        "git_dirty": bool(_git("status", "--porcelain")),
    }


class Recorder:
    """What an eval section talks to. The base class does nothing.

    Handing out a no-op rather than ``None`` keeps the call sites free of
    ``if tracking:`` — a section logs its metrics the same way whether or not
    anything is listening.
    """

    enabled = False
    run_id = ""

    def params(self, values: dict[str, object]) -> None: ...

    def metrics(self, section: str, values: dict[str, object]) -> None: ...

    def note(self, filename: str, body: str) -> None: ...

    def finish(self, report: str) -> None: ...


class _MlflowRecorder(Recorder):
    enabled = True

    def __init__(self, mlflow, run) -> None:
        self._mlflow = mlflow
        self.run_id = run.info.run_id
        self._warned = False

    def _try(self, what: str, fn) -> None:
        try:
            fn()
        except Exception as err:  # logging must never break a paid-for run
            if not self._warned:
                print(f"  mlflow: {what} failed ({type(err).__name__}: {err})")
                self._warned = True

    def params(self, values: dict[str, object]) -> None:
        payload = {k: str(v) for k, v in values.items() if v is not None}
        if payload:
            self._try("log_params", lambda: self._mlflow.log_params(payload))

    def metrics(self, section: str, values: dict[str, object]) -> None:
        payload: dict[str, float] = {}
        for key, value in values.items():
            if value is None or isinstance(value, bool):
                continue
            try:
                payload[f"{section}/{_clean_key(key)}"] = float(value)  # type: ignore[arg-type]
            except (TypeError, ValueError):
                continue
        if payload:
            self._try("log_metrics", lambda: self._mlflow.log_metrics(payload))

    def note(self, filename: str, body: str) -> None:
        self._try("log_text", lambda: self._mlflow.log_text(body, filename))

    def finish(self, report: str) -> None:
        if report.strip():
            self.note("report.txt", report)
        self._try("end_run", self._mlflow.end_run)


class _Tee(io.TextIOBase):
    """Passes stdout through untouched while keeping a copy for the artifact."""

    def __init__(self, stream) -> None:
        self._stream = stream
        self.captured = io.StringIO()

    def write(self, text: str) -> int:
        self._stream.write(text)
        self.captured.write(text)
        return len(text)

    def flush(self) -> None:
        self._stream.flush()


def _ensure_experiment(mlflow) -> None:
    """Selects the experiment, pinning artifacts to an absolute path.

    With a SQLite backend MLflow resolves artifacts relative to the working
    directory, so a run started from the repo root and one started from
    `artifacts/ai-service` would write their reports to two different trees and
    the older run's report would 404 in the UI. An absolute location on the
    experiment removes the dependency on where the command was typed. It can
    only be set at creation, so an experiment that already exists is left as it
    is — including one a tracking server owns.
    """
    if mlflow.get_experiment_by_name(EXPERIMENT) is None:
        try:
            mlflow.create_experiment(EXPERIMENT, artifact_location=DEFAULT_ARTIFACTS)
        except Exception:
            pass  # a concurrent run created it; set_experiment picks it up
    mlflow.set_experiment(EXPERIMENT)


def _disabled_reason() -> str | None:
    """None when tracking should run, otherwise the line to print instead."""
    if os.getenv("ADALAT_MLFLOW", "1").lower() in ("0", "false", "off", "no"):
        return "mlflow: disabled by ADALAT_MLFLOW"
    return None


@contextmanager
def tracked_run(
    name: str, *, params: dict[str, object] | None = None
) -> Iterator[Recorder]:
    """Opens an MLflow run around an eval, or yields a no-op recorder.

    Everything printed inside the block is echoed to the terminal as usual and
    also stored on the run as ``report.txt``.
    """
    reason = _disabled_reason()
    if reason:
        print(f"  {reason}")
        yield Recorder()
        return

    try:
        import mlflow
    except ImportError:
        print(
            "  mlflow: not installed, metrics are printed only"
            '  (pip install -e ".[eval]")'
        )
        yield Recorder()
        return

    try:
        uri = os.getenv("MLFLOW_TRACKING_URI") or DEFAULT_STORE
        mlflow.set_tracking_uri(uri)
        _ensure_experiment(mlflow)
        run = mlflow.start_run(run_name=name)
    except Exception as err:
        print(f"  mlflow: could not start a run ({type(err).__name__}: {err})")
        yield Recorder()
        return

    recorder = _MlflowRecorder(mlflow, run)
    recorder.params({**_provenance(), **(params or {})})
    # ASCII only, for the reason the reports are: a Windows console defaults to
    # cp1252 and a stray separator glyph is enough to break a run's output.
    print(f"  mlflow: {EXPERIMENT}/{name} run {recorder.run_id[:8]} -> {uri}")

    tee = _Tee(sys.stdout)
    try:
        with redirect_stdout(tee):
            yield recorder
    finally:
        recorder.finish(tee.captured.getvalue())

# Recorded-run audio

Voiced lines for the presenter view at `/recorded`.

**Only the agents are voiced here — 16 files.** Counsel's eleven lines are
spoken live at the podium, so they need no audio and are not named in this
directory. `docs/demo-tts-manifest.md` numbers exactly the files to produce and
lists the counsel lines unnumbered, so the count in the table is the count of
files. Save each one here under exactly the name given (`judge-07.mp3`,
`opposing-06.mp3`, `witness-04.mp3`, …).

Use a distinct voice per speaker — the bench, opposing counsel, and each witness.
Distinguishable voices are most of what makes a courtroom read as a courtroom.

Voice only what the manifest lists. Those are the words the agents actually
produced during the captured run; writing new ones would make the replay a
dramatisation rather than a recording, which is the one thing it must not be.

A line with no file still plays — it renders as text and advances after a few
seconds — so the run is presentable before the set is complete.

Regenerate the manifest at any time with:

    pnpm run capture-demo --manifest-only

That reads the run already on disk. It makes no model calls and does not touch
the captured transcript.

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The service lives at artifacts/ai-service, so the workspace .env is two
# levels up. Sharing one .env with the Node services keeps credentials in a
# single place rather than drifting between runtimes.
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    openai_api_key: str

    ai_service_port: int = 8000

    model_text: str = "gpt-4o"
    model_embedding: str = "text-embedding-3-small"

    # The cheap model in the objection cascade. Opposing counsel screens every
    # single question put to a witness, and the honest answer to most of them is
    # "no objection" — a decision that does not need a frontier model. The cheap
    # model takes that majority; anything it wants to object to is re-decided by
    # model_text before it reaches the student, because a wrong objection teaches
    # a law student a wrong rule. Set objection_cascade=false to route every
    # screen through model_text and compare (see eval/courtroom_eval.py).
    model_fast: str = "gpt-4o-mini"
    objection_cascade: bool = True

    # Must match the model that produced the vectors already stored in
    # statute_sections.embedding. Changing it requires a re-index via
    # `node scripts/ingest-statutes.mjs --force`.
    embedding_dimensions: int = 1536

    # Reranking backend. Defaults to `llm` on measured evidence, not taste.
    #
    # A general-purpose MS MARCO cross-encoder was benchmarked against this
    # corpus and made retrieval materially worse. On the query "the witness is
    # just repeating what somebody else told him outside court", the governing
    # provision (QSO 1984 Art. 71, oral evidence must be direct) ranked:
    #
    #   RRF fusion alone ....... #2
    #   LLM reranker ........... #1
    #   ms-marco-MiniLM-L-6-v2 . #10   (every score negative)
    #
    # ms-marco models are trained on Bing web-search query/passage pairs. They
    # reward lexical and topical overlap, and have no representation of legal
    # doctrine — nothing in that training signal connects a colloquial
    # description of hearsay to the article that codifies it. Out-of-domain
    # cross-encoders are worse than no reranker here.
    #
    #   llm:           text model scores legal applicability. Best measured
    #                  quality; ~3-4s and a token cost per query.
    #   cross_encoder: local sentence-transformers model. Fast and free, but
    #                  needs a legal- or instruction-tuned checkpoint (e.g. a
    #                  BGE reranker) to be worth using. See docs/retrieval.md.
    #   none:          skip reranking, return the RRF ordering.
    reranker_backend: str = "llm"
    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    # Reciprocal Rank Fusion damping constant (Cormack et al., 2009).
    rrf_k: int = 60

    @property
    def asyncpg_dsn(self) -> str:
        # asyncpg does not accept the postgresql+driver:// form some tools emit.
        return self.database_url.replace("postgresql+asyncpg://", "postgresql://")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]

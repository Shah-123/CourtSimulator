# Retrieval design and measurements

## Architecture

Two retrievers run independently and are fused, then the fused head is
reranked.

```
query ──┬─► BM25 (rank_bm25, in-memory)      ──► ranked ids ──┐
        │                                                     ├─► RRF ──► rerank ──► top-k
        └─► dense vectors (OpenAI, numpy exact) ─► ranked ids ─┘
```

### Why hybrid

Legal queries are bimodal, and neither retriever covers both modes:

| Query | Found by |
|---|---|
| "section 302", "qatl-i-amd" | BM25 — exact terms embeddings blur into neighbouring provisions |
| "the witness is repeating what someone else told him" | Dense — shares no vocabulary with Art. 71 |

### Why RRF rather than score blending

BM25 scores are unbounded (7.12 in one query, 40+ in another); cosine
similarities sit in a narrow 0.30–0.45 band. Blending them directly requires a
normalisation constant that has to be retuned whenever the corpus changes.
Reciprocal Rank Fusion uses only rank position, so it is scale-free:

```
score(d) = Σ  1 / (k + rank_r(d))        k = 60
         r∈retrievers
```

`k = 60` is from Cormack et al. (2009). It damps the head so a single
retriever's top hit cannot dominate the fusion.

### Why exact search rather than pgvector / HNSW

The corpus is ~53 provisions today and would be a few thousand fully ingested.
A full `numpy` matrix multiply over 5,000 × 1536 float32 takes single-digit
milliseconds — faster than an approximate index, with exact recall, and it
removes the pgvector extension from the deployment requirements. Approximate
indexing earns its complexity somewhere north of 10⁵ vectors.

## Measured: the reranker choice

A general-purpose cross-encoder was benchmarked and **rejected on evidence**.

Query: *"the witness is just repeating what somebody else told him outside court"*

Correct answer: **QSO 1984 Art. 71** — *Oral evidence must be direct* (the
provision codifying the rule against hearsay).

| Reranker | Rank of Art. 71 | Notes |
|---|---|---|
| None (RRF only) | **#2** | Art. 151 "Impeaching credit" ranked above it |
| `ms-marco-MiniLM-L-6-v2` | **#10 of 15** | every score negative |
| LLM (`gpt-4o`) | **#1** | score 10/10 |

The MS MARCO model made retrieval *worse than not reranking at all*.

**Why.** `ms-marco-*` checkpoints are trained on Bing query/passage pairs. The
training signal rewards lexical and topical overlap in a web-search
distribution. Nothing in it connects a colloquial description of hearsay to the
statutory language "oral evidence must, in all cases whatever, be direct" —
the two share no surface features. The uniformly negative scores are the model
correctly reporting that the whole corpus is out of its distribution.

**Conclusion.** An out-of-domain cross-encoder is worse than no reranker. The
LLM backend is the default. `cross_encoder` remains available for when a
legal- or instruction-tuned checkpoint (e.g. a BGE reranker) is worth the
weights — the interface is unchanged, only `RERANKER_BACKEND` moves. Its
weights are no longer a base dependency, though: torch is an opt-in extra
(`pip install -e "artifacts/ai-service[crossencoder]"`), so the container image
does not carry 2.5 GB for a backend the measurement rejected. `reranker.py`
imports it lazily and degrades to the LLM backend when it is absent.

The LLM reranker also demonstrates domain reasoning the bi-encoders cannot: on
the same query it promotes **Art. 46** (statements by a person who cannot be
called as a witness — the dying-declaration *exception* to hearsay) from RRF
rank 19 into the top 3. That is a doctrinal relationship, not a similarity.

### Cost of that quality

| Backend | Latency (15 candidates) | Token cost |
|---|---|---|
| none | ~0.9s | none |
| llm | ~8s | one call/query |
| cross_encoder | ~0.02s (after load) | none |

Reranking is therefore **off for live voice turns** (where latency is the
product) and **on for case generation, objection rulings and verdicts** (where
correctness is).

## Failure behaviour

Reranking is an optimisation, never a dependency:

```
cross_encoder ──fails──► llm ──fails──► RRF ordering unchanged
```

A reranker outage degrades result ordering. It never fails a request.

# Architecture Decisions

A lightweight index of the significant design decisions in fedmin-chat — what was chosen, why,
and the trade-off accepted. Deeper rationale lives in the linked notes, the
[README](../README.md), and the code.

Related notes:
- [Pinecone vs. Postgres + pgvector](./pinecone-vs-pgvector.md)
- [Switching LLMs / providers in industry](./llm-provider-switching.md)

---

### 1. Agentic tool-calling loop over single-shot RAG
**Decision:** The chat endpoint runs a multi-step agent that plans its own retrieval, instead of
a fixed embed → search → answer pass.
**Why:** Single-shot retrieval missed relevant meetings; an agent can search several ways and
drill into specific meetings before answering.
**Trade-off:** More latency and token cost per query than one-shot. *(See README → How It Works.)*

### 2. LangGraph for agent orchestration
**Decision:** Model the agent as a LangGraph `StateGraph` (agent ⇄ ToolNode) rather than a
hand-rolled loop.
**Why:** Explicit state machine, clean tool wiring, and forced-first-search / max-step-fallback
control; idiomatic and extensible.
**Trade-off:** A framework dependency over ~90 lines of hand-rolled loop — justified by
extensibility and as a demonstrable skill, not strictly necessary at this size.

### 3. Retrieve-and-rerank over plain multi-query
**Decision:** `search_minutes` = multi-query expansion for recall, then **LLM reranking** for
precision.
**Why:** The eval *falsified* multi-query-alone (it didn't recover the canonical August 1971
meeting); reranking did, by promoting the actual announcement over topically-similar meetings.
**Trade-off:** An extra LLM call per search. *(See README → Evaluation.)*

### 4. Date-aware hybrid retrieval (self-query + SQL date filter)
**Decision:** Extract a temporal constraint from the question and apply it as a
`meeting_date BETWEEN` filter, composed with rerank.
**Why:** The discriminating signal for time-scoped questions is the date, which embeddings
capture poorly. Date narrows; rerank sharpens; they compose.
**Trade-off:** A date-extraction LLM call per query; only active on the Postgres backend.

### 5. Postgres + pgvector over Pinecone
**Decision:** Migrate the vector store from Pinecone to Postgres + pgvector (Supabase).
**Why:** Capability-driven — the date-aware hybrid (#4) and the full-meeting reader (#11) need
SQL range filters and ordered lookups that a pure vector store can't do cleanly. At ~26k
vectors, scale/perf is a non-issue and cost went to $0.
**Trade-off:** Connection pooling and DB ops, vs. Pinecone's stateless simplicity.
→ [pinecone-vs-pgvector.md](./pinecone-vs-pgvector.md)

### 6. `halfvec` + exact search (no ANN index)
**Decision:** Store embeddings as `halfvec(1536)` (16-bit) and search exactly (no HNSW/IVFFlat).
**Why:** Fits the full corpus in a 500 MB free tier (~146 MB); at 26k vectors exact search is
fast enough and a parity eval showed no quality loss.
**Trade-off:** Won't scale to millions of vectors without adding an index — fine at this size.

### 7. Native embeddings/score path, not LangChain's `MultiQueryRetriever`
**Decision:** Drive expansion/rerank with LangChain primitives but keep the native
embedding + vector-store path that preserves cosine similarity scores.
**Why:** The stock `MultiQueryRetriever` discards similarity scores, which the citations
("% match") and the eval (MRR) depend on.
**Trade-off:** A bit more glue code in exchange for honest scores.

### 8. Two-dimensional eval discipline
**Decision:** A **retrieval** eval (keyword recall / hit-rate / MRR, single → +date → rerank)
*and* an **answer-quality** eval (LLM-as-judge faithfulness + relevance), both gating.
**Why:** Retrieval correctness and generation faithfulness are different failure modes; you need
both to ship/swap safely. These evals drove the design and guard regressions.
**Trade-off:** The judge is itself an LLM (a signal, not ground truth). *(See README → Evaluation.)*

### 9. Pluggable backend behind a `VECTOR_BACKEND` flag
**Decision:** Dispatch retrieval to Pinecone or Postgres via an env flag, behind one seam
(`lib/vector-search.ts`).
**Why:** Enables A/B comparison, a parity gate before cutover, and instant rollback.
**Trade-off:** A small amount of dispatch/translation code.

### 10. LangSmith tracing, env-gated
**Decision:** Trace the agent/retrieval to LangSmith when env vars are set; graceful no-op
otherwise. Serverless flush via `LANGCHAIN_CALLBACKS_BACKGROUND=false`.
**Why:** Observability into the multi-step loop without coupling the app to a tracing vendor.
**Trade-off:** None meaningful — it's opt-in.

### 11. Full-meeting reader via ordered SQL + chunk stitching
**Decision:** Reconstruct a meeting's full text from its ordered chunks
(`ORDER BY chunk_index`), stitching the ~50-token overlaps, rather than storing a duplicate
`full_text`.
**Why:** Zero extra storage; the ordered lookup is trivial in SQL. Enables "read the full
meeting" in-app.
**Trade-off:** Overlap-dedup logic (unit-tested) vs. duplicated storage.

### 12. Model tiering by task
**Decision:** GPT-4o for the agent; gpt-4o-mini for query expansion, reranking, and date
extraction; GPT-4o as the eval judge.
**Why:** Use the cheapest model that's good enough per task — the standard cost lever.
**Trade-off:** None observed; verified by the evals.
→ [llm-provider-switching.md](./llm-provider-switching.md)

### 13. Test the model boundary, run the real graph
**Decision:** Unit tests mock the chat model (and retrieval) but execute the *real* LangGraph
state machine and tools.
**Why:** Makes non-deterministic LLM orchestration testable deterministically, while still
exercising the actual control flow (forced-first-search, fallback, drill-down).
**Trade-off:** Tests assert on structure/flow, not answer content. *(See README → Testing.)*

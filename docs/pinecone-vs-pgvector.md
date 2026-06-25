# Pinecone vs. Postgres + pgvector — Tradeoffs

*Reference note (June 2026). fedmin-chat started on Pinecone and migrated to Postgres +
pgvector (Supabase). This captures the honest tradeoffs — including the gotchas we actually
hit — rather than a one-sided justification.*

**TL;DR:** Pinecone is a managed, purpose-built vector database — zero ops, stateless,
scales transparently. Postgres + pgvector is a relational database that also does vectors —
one datastore for vectors *and* structured data, with full SQL, at the cost of running a DB
(connections, pooling, tuning). For pure semantic search at large scale, Pinecone is simpler.
For **hybrid** retrieval (vectors + structured filters/joins/full-text) at small-to-medium
scale, pgvector wins — which is why this project moved.

---

## Quick reference

| Dimension | Pinecone | Postgres + pgvector |
|---|---|---|
| **Type** | Managed, purpose-built vector DB | Relational DB + vector extension |
| **Ops burden** | None (fully managed) | Run a DB (Supabase/Neon manage most of it) |
| **Connection model** | Stateless HTTP — no pooling | TCP connections — needs pooling in serverless |
| **Setup friction** | API key, done | Pooler choice, SSL config, schema, indexes |
| **Scale** | Transparent to billions | Good to ~millions (HNSW); tune beyond |
| **Pure semantic search** | Excellent, turnkey | Good |
| **Hybrid / SQL filters** | Metadata filters only ($eq/$in, numeric ranges) | Full SQL: ranges, JOINs, full-text, ordered reads |
| **Relational data** | Vectors + metadata blob | First-class; one store for everything |
| **Cost (small scale)** | Free starter; paid ~$50+/mo | Free tier easily fits (we used 146 MB) |
| **Cost (huge scale)** | Predictable managed pricing | Cheaper compute, but you operate it |
| **Introspection** | `describeIndexStats`, limited | Full SQL — query/inspect anything |
| **Lock-in** | Proprietary | Open, portable, standard Postgres |

---

## Dimension by dimension

### Operations & setup
- **Pinecone**: create an index, get an API key, done. Stateless HTTP requests — nothing to
  pool, no SSL config, no connection limits. This is genuinely less to think about.
- **pgvector**: you run a database. Even on a managed host (Supabase/Neon) you deal with
  connection pooling, SSL, schema, and indexes. Real friction we hit (see Gotchas below).

### Connection model (matters a lot in serverless)
- **Pinecone**: stateless HTTP — perfect for serverless/Vercel. Each request is independent.
- **pgvector**: Postgres connections are stateful and limited. From serverless you **must**
  use a transaction-mode pooler (PgBouncer / Supabase Supavisor `:6543` / Neon `-pooler`),
  or many cold function instances exhaust the connection limit. This is the single biggest
  operational difference.

### Scale & performance
- **Pinecone**: purpose-built ANN, scales to billions transparently. No index tuning.
- **pgvector**: HNSW or IVFFlat indexes; great to ~millions, but you tune (index params,
  `ef_search`, etc.) as you grow. At small scale you can even skip the ANN index and do
  **exact** search — which is what this project does at ~26k vectors (fast enough, and it
  freed the storage the HNSW index would have used). Past a few million vectors, Pinecone's
  hands-off scaling is a real advantage.

### Hybrid retrieval & relational features — the deciding factor here
- **Pinecone**: metadata filters support `$eq/$ne/$in/$nin` and **numeric** ranges
  (`$gte/$lte`). So date filtering *is* possible — but you'd have to encode dates as numbers
  (e.g. `19710815`), and you still can't do JOINs, SQL `EXTRACT`, full-text search, or ordered
  full-document reads.
- **pgvector**: vectors live next to a real schema, so you combine semantic search with
  arbitrary SQL in one query: `WHERE meeting_date BETWEEN … ORDER BY embedding <=> $1`,
  `tsvector` full-text, JOINs, and ordered lookups. This is what made the project's
  **date-aware hybrid retrieval** and the **full-meeting reader** (ordered chunk reconstruction)
  natural — both are awkward or impossible against a pure vector store.

### Cost
- **Small scale**: pgvector wins. This corpus (26,634 chunks) fits a **free** Supabase tier in
  ~146 MB (using `halfvec` 16-bit vectors + exact search). Pinecone has a free starter tier
  too, but production plans start higher.
- **Large scale**: less clear. Pinecone's managed pricing is predictable and includes the ops;
  self-run Postgres is cheaper compute but you operate it (or pay a managed host that, at
  scale, costs real money).

### Lock-in & portability
- **Pinecone**: proprietary API and data format.
- **pgvector**: standard Postgres — portable across any Postgres host, and you can leave with a
  `pg_dump`.

---

## When to choose which

**Reach for Pinecone when:**
- Scale is large (10M+ vectors) or growth is unpredictable and you want hands-off scaling.
- The workload is **pure semantic search** — no structured filtering, joins, or full-text.
- You want zero database ops, or the team has no Postgres expertise.

**Reach for Postgres + pgvector when:**
- You need **hybrid** retrieval — vectors combined with SQL filters (dates, categories), JOINs,
  full-text, or ordered document access.
- You already run Postgres, or want **one datastore** instead of syncing two.
- You're cost-sensitive at small/medium scale, or want portability / no lock-in.

A useful heuristic: **if the discriminating signal in your queries is structured (a date, an
author, a category), pgvector's SQL is a real advantage. If it's purely semantic, Pinecone's
turnkey scaling is.**

---

## What this project chose, and why

Migrated **Pinecone → Postgres + pgvector** — a *capability-driven* decision, not a cost one:

1. **Date-aware hybrid retrieval** needed a real `date` column to range-filter cleanly and
   combine with the vector search in one query.
2. The **full-meeting reader** needed ordered chunk reconstruction
   (`WHERE meeting_id = $1 ORDER BY chunk_index`) — trivial SQL, awkward against a vector store.
3. At ~26k vectors, **scale/performance is a non-issue either way**, so the usual Pinecone
   advantage didn't apply.
4. **Cost** went to $0 (free Supabase tier).

Pinecone is kept behind a `VECTOR_BACKEND` flag for A/B comparison and instant rollback, and a
**parity eval** confirmed the swap was retrieval-neutral before cutting over.

---

## Gotchas we actually hit (pgvector on Supabase, serverless)

- **SSL "self-signed certificate in chain"**: newer `node-postgres` treats `sslmode=require` as
  full verification, which rejects Supabase's pooler cert. Fix: strip `sslmode` from the
  connection string and set `ssl: { rejectUnauthorized: false }` (encrypt without chain
  verification — standard for Supabase + pg).
- **Two different pooler endpoints**: use the **session** pooler (`:5432`) for one-shot bulk
  ingest, and the **transaction** pooler (`:6543`) for the serverless runtime. The direct
  connection is IPv6-only on the free tier and often unreachable locally.
- **Storage budget**: full-precision `vector(1536)` + an HNSW index would have blown the 500 MB
  free tier. `halfvec(1536)` (16-bit) + exact search (no ANN index) cut it to ~146 MB with no
  measurable quality loss (the eval confirmed parity).
- **Verify the swap with an eval**: don't trust "it returns results." A retrieval eval proved
  the Postgres backend matched the Pinecone baseline exactly before cutover.

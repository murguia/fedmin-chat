# Fed Minutes Chat

A conversational AI interface for exploring Federal Reserve meeting minutes from 1967–1973. Ask natural language questions about monetary policy, economic conditions, and Fed decision-making during one of the most pivotal eras in modern economic history — covering the collapse of Bretton Woods, the Nixon Shock, rising inflation, and the shift from fixed to floating exchange rates.

Unlike traditional keyword search, this app uses **semantic search** (vector embeddings) to find relevant passages by meaning. Rather than a single fixed lookup, a **GPT-4o tool-calling agent** plans its own retrieval — issuing multiple searches and drilling into specific meetings — before synthesizing a cited answer.

## How It Works

The chat endpoint runs an agentic research loop instead of a one-shot retrieve-then-answer pass:

1. **User asks a question** in natural language
2. **The agent plans its retrieval.** GPT-4o is given two tools and decides how to use them:
   - `search_minutes` — semantic search across all minutes
   - `search_within_meeting` — semantic search scoped to a single meeting, for drilling into the most relevant one
3. **The loop runs** (`lib/agent.ts`): the model can call the tools repeatedly — comparing topics, gathering more context, or narrowing in — reading each result before deciding its next step. A search is forced on the first turn so every answer is grounded in retrieved text.
4. **GPT-4o synthesizes** an answer grounded only in the excerpts the agent retrieved.
5. **Citations** are deduped across all of the agent's searches, ranked by relevance, and displayed with meeting dates, attendees, relevance scores, and expandable source text.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Embeddings:** OpenAI text-embedding-ada-002 (1536 dimensions)
- **Vector DB:** Pinecone (serverless, cosine similarity)
- **LLM:** GPT-4o tool-calling agent with grounding constraints to prevent hallucination
- **Deployment:** Vercel

## Data Pipeline

The ingestion pipeline (`scripts/ingest.ts`) processes meeting data through:

1. **Chunking** — splits meeting text on sentence boundaries using tiktoken (500-token chunks, 50-token overlap)
2. **Embedding** — generates vector embeddings via OpenAI in batches of 100
3. **Upserting** — stores chunks with metadata (date, attendees, topics) in Pinecone

```bash
npm run fetch-data       # Download meeting data
npm run setup-pinecone   # Create Pinecone index
npm run ingest           # Run full pipeline
npm run ingest:dry-run   # Test without API calls
```

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your OPENAI_API_KEY and PINECONE_API_KEY

# Run the data pipeline (if starting fresh)
npm run fetch-data
npm run setup-pinecone
npm run ingest

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start asking questions.

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
```

26 tests across 3 suites:
- **Agent loop** — forced grounding on the first turn, multi-step tool calls, meeting drill-down, step-budget fallback, and malformed-response handling (OpenAI and Pinecone mocked)
- **Rate limiter** — request allowance, IP isolation, window reset, remaining count
- **Text chunker** — sentence boundary splitting, token limits, overlap, content preservation

## Evaluation

Retrieval quality is measured independently of generation with an eval harness (`evals/retrieval-eval.ts`). It runs a golden set of questions through the retrieval primitive (embedding → Pinecone search) and scores whether the passages a correct answer depends on are surfaced. Requires `OPENAI_API_KEY` and `PINECONE_API_KEY`, since it queries the live index.

```bash
npm run eval                    # default top-k 5
npm run eval -- --top-k 10      # widen retrieval
npm run eval -- --threshold 0.8 # gate strictness
```

Each case in `evals/dataset.json` declares what a correct retrieval should surface:
- **`expected_keywords`** — substrings that should appear in the retrieved excerpts
- **`expected_meetings`** — meeting IDs that should appear in the ranked results

The harness reports **keyword recall**, **meeting hit-rate**, and **MRR**, and exits non-zero when keyword recall falls below the threshold (so it can gate CI).

This decoupling makes retrieval regressions visible on their own terms. For example, at the production default of top-k=5, single-shot retrieval misses the canonical Nixon Shock meeting (`NT50808.txt`) for a "convertibility"-phrased question — it ranks 6–10 and only appears once `--top-k 10` is used. This is exactly the gap the agent loop closes: its multi-step search and meeting drill-down recover the right source where a single fixed lookup does not.

The dataset is a seed set meant to be expanded; the companion [FedMinutes](https://github.com/murguia/FedMinutes) project is well suited to generating verified question → meeting labels.

## Companion Project

This project is the consumer-facing counterpart to [FedMinutes](https://github.com/murguia/FedMinutes), a Python research backend with Jupyter notebooks for deep analysis and report generation.

| Aspect | FedMinutes | fedmin-chat |
|--------|-----------|-------------|
| Type | Python backend + Jupyter notebooks | Next.js web app |
| Interface | Notebooks for researchers | Chat UI for end users |
| Embeddings | all-MiniLM-L6-v2 (local, 384d) | OpenAI ada-002 (API, 1536d) |
| Vector DB | ChromaDB (local) | Pinecone (serverless) |
| Output | Academic reports (HTML/PDF) | Conversational responses with citations |
| Deployment | Local/research use | Vercel |

## Data Attribution

The documents in this project are **Federal Reserve Board of Governors meeting minutes** — distinct from the more commonly known FOMC transcripts. While FOMC transcripts are released after 5 years, Board of Governors minutes had never been publicly released; the most recent public ones dated to December 1966 before this FOIA request.

These approximately 30,000 pages were obtained via a Freedom of Information Act (FOIA) request by [Crisis Notes / Nathan Tankus](https://www.crisesnotes.com/database/), spanning 1967–1973 and covering over 1,100 meetings. The documents reveal previously unknown institutional decisions, including how the Fed nearly repealed its own emergency lending powers in 1967 and came close to bailing out the savings and loan industry in 1973.

Read more: [Here Are The 30,000 Pages of Federal Reserve Board Meeting Minutes I Got Through FOIA](https://www.crisesnotes.com/here-are-the-30-000-pages-of-federal-reserve-board-meeting-minutes-i-got-through-foia/)

# Fed Minutes Chat

A conversational AI interface for exploring Federal Reserve meeting minutes from 1967–1973. Ask natural language questions about monetary policy, economic conditions, and Fed decision-making during one of the most pivotal eras in modern economic history — covering the collapse of Bretton Woods, the Nixon Shock, rising inflation, and the shift from fixed to floating exchange rates.

Unlike traditional keyword search, this app uses **semantic search** (vector embeddings) to find relevant passages by meaning, then synthesizes answers with citations using GPT-4o.

## How It Works

1. **User asks a question** in natural language
2. **Semantic search** converts the query to a vector embedding and finds the most relevant meeting excerpts in Pinecone
3. **GPT-4o** synthesizes an answer grounded in the retrieved excerpts
4. **Citations** are displayed with meeting dates, attendees, relevance scores, and expandable source text

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Embeddings:** OpenAI text-embedding-ada-002 (1536 dimensions)
- **Vector DB:** Pinecone (serverless, cosine similarity)
- **LLM:** GPT-4o with grounding constraints to prevent hallucination
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

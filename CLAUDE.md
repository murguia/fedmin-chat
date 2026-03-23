# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Git Discipline

**Never commit or push without explicit permission.**

- Always ask before running `git commit` or `git push`
- Don't assume the user wants changes committed just because a task is complete
- Wait for the user to say "commit", "push", or similar before doing so

## 5. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Development Commands

### Core Commands
- `npm run dev` - Start development server (http://localhost:3000)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint linter

### Data Processing
- `npm run fetch-data` - Download Fed minutes data from FedMinutes repo
- `npm run setup-pinecone` - Create Pinecone index
- `npm run ingest` - Process meeting text and create embeddings for Pinecone
- `npm run ingest:dry-run` - Test ingestion pipeline without API calls

## Architecture Overview

This is a RAG (Retrieval-Augmented Generation) application that enables semantic Q&A about Federal Reserve Board of Governors meeting minutes (1967–1973). These documents were never publicly released before a FOIA request by Crisis Notes / Nathan Tankus.

### Core Architecture
1. **Document Processing**: Meeting text is chunked into ~500 token segments with 50-token overlap, split on sentence boundaries
2. **Embeddings**: OpenAI text-embedding-ada-002 (1536 dimensions) creates vector representations
3. **Vector Storage**: Pinecone (serverless, cosine similarity) stores embeddings with metadata
4. **Query Processing**: User questions are embedded and matched against stored vectors (topK=5, minScore=0.7)
5. **Response Generation**: GPT-4o synthesizes answers grounded in retrieved chunks (temperature=0.3)

### Key Components

#### API Route (`app/api/chat/route.ts`)
- Handles chat requests with IP-based rate limiting (20 req/min)
- Generates query embedding, searches Pinecone, builds context from matches
- Returns structured response with citations including relevance scores
- 30-second max duration configured in vercel.json

#### Frontend (`components/Chat.tsx`)
- Single-page chat interface with dark slate/emerald theme
- Citations with expandable source text, attendee tags, and "View original PDF" links
- Dual view modes for citations: list and timeline
- Copy-to-clipboard on excerpts
- Responsive design with mobile-specific spacing

#### About Modal (`components/AboutSection.tsx`)
- Uses createPortal to render on document.body (avoids sticky header z-index issues)
- Explains RAG pipeline, historical context, and data source attribution

#### Data Pipeline (`scripts/ingest.ts`)
- TextChunker class uses tiktoken GPT-4 encoder for accurate token counting
- Splits on sentence boundaries: `/(?<=[.!?])\s+/`
- Parses JSON string fields (attendees, topics, decisions) from meeting data
- Batch embedding and upsert (100 at a time)
- Supports --dry-run, --limit, and --data flags

#### Vector DB Utilities (`lib/pinecone.ts`)
- Singleton Pinecone client
- Query function with configurable topK and minimum relevance score

#### LLM Utilities (`lib/openai.ts`)
- Singleton OpenAI client
- System prompt with grounding constraints: answers based ONLY on provided excerpts
- Era context (Bretton Woods, Nixon Shock) primed in the prompt

#### Rate Limiting (`lib/rate-limit.ts`)
- In-memory IP-based rate limiter (20 requests/minute)
- Periodic cleanup of expired entries
- Note: not shared across Vercel serverless instances

### Environment Configuration

Required variables:
- `OPENAI_API_KEY` - For embeddings and LLM (required)
- `PINECONE_API_KEY` - Vector database (required)
- `PINECONE_INDEX_NAME` - Defaults to "fedmin-chat"

### Key Data Relationships

- Meeting IDs use format `NT#####.txt` (e.g., `NT50000.txt`)
- Original PDFs at `https://files.crisesnotes.com/NT#####.pdf`
- Citation links map meeting_id `.txt` → `.pdf` to link back to source documents
- Companion project: [FedMinutes](https://github.com/murguia/FedMinutes) (Python/ChromaDB) at `/Users/rpm/Projects/FedMinutes`

### Deployment

- Hosted on Vercel at https://fedmin-chat.vercel.app
- Region: iad1 (Northern Virginia)
- Cache-Control headers set to `no-cache, no-store, must-revalidate` to prevent Safari stale cache issues
- OpenGraph/Twitter meta tags configured for social sharing

## Testing and Validation

Always run type checking after making changes:
```bash
npx tsc --noEmit
```

Test the data pipeline without API calls:
```bash
npm run ingest:dry-run
```

import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { traceable } from 'langsmith/traceable';
import { generateEmbedding } from './openai';
import { vectorSearch, type VectorFilter } from './vector-search';
import { extractDateRange } from './date-filter';
import type { PineconeMatch } from '@/types';

// Embeddings stay on the native path (generateEmbedding) so query vectors use
// the exact same ada-002 model the ingest pipeline wrote to the index, and
// Pinecone's native client preserves similarity scores that citations and the
// eval harness depend on. LangChain drives query expansion and reranking
// (ChatOpenAI), the agent (LangGraph), and tracing (LangSmith).

let assistModel: ChatOpenAI | null = null;

// Small, cheap model for the query-expansion and rerank helper steps.
function getAssistModel(): ChatOpenAI {
  if (!assistModel) {
    assistModel = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0 });
  }
  return assistModel;
}

/**
 * Single-query semantic retrieval. Embeds the query and searches Pinecone,
 * preserving relevance scores. Optional metadata filter scopes the search.
 */
export const retrieve = traceable(
  async function retrieve(
    query: string,
    topK = 5,
    minScore = 0.7,
    filter?: VectorFilter
  ): Promise<PineconeMatch[]> {
    const embedding = await generateEmbedding(query);
    return vectorSearch(embedding, topK, minScore, filter);
  },
  { name: 'retrieve' }
);

/**
 * Expands a query into a few alternative phrasings so retrieval is robust to
 * how a question happens to be worded. Different vocabulary surfaces passages
 * a single phrasing misses. The original query is always included.
 */
const expandQuery = traceable(
  async function expandQuery(query: string): Promise<string[]> {
    const res = await getAssistModel().invoke([
      new SystemMessage(
        `You rewrite a search query into 3 alternative phrasings that would surface
different but relevant passages from a historical document corpus (1960s-70s
Federal Reserve minutes). Vary the vocabulary, synonyms, and specificity.
Return ONLY the 3 rewrites, one per line, with no numbering or commentary.`
      ),
      new HumanMessage(query),
    ]);

    const text = typeof res.content === 'string' ? res.content : '';
    const variations = text
      .split('\n')
      .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean);

    return [query, ...variations].slice(0, 4);
  },
  { name: 'expandQuery' }
);

/**
 * LLM reranking: reorder a candidate pool by how directly each passage answers
 * the question, attending to specifics (dates, named decisions) that embedding
 * similarity captures poorly. Embedding search is strong on topical recall but
 * weak on precision — e.g. many meetings discuss "gold convertibility," but only
 * one is the Aug 1971 suspension. Reranking fixes that. Similarity scores are
 * left untouched on each match (for citation display); only the order changes.
 */
const rerank = traceable(
  async function rerank(
    question: string,
    pool: PineconeMatch[],
    topK: number
  ): Promise<PineconeMatch[]> {
    if (pool.length <= topK) return pool;

    const candidates = pool
      .map((m, i) => {
        const excerpt = m.metadata.text.slice(0, 220).replace(/\s+/g, ' ').trim();
        return `[${i}] (${m.metadata.date}, ${m.metadata.meeting_type}) ${excerpt}`;
      })
      .join('\n');

    const res = await getAssistModel().invoke([
      new SystemMessage(
        `You re-rank candidate excerpts by how directly they answer the user's
question, weighing specifics such as dates and named decisions, not just topical
overlap. Return ONLY the indices of the top ${topK} candidates, most relevant
first, comma-separated (e.g. "3,0,7").`
      ),
      new HumanMessage(`Question: ${question}\n\nCandidates:\n${candidates}`),
    ]);

    const text = typeof res.content === 'string' ? res.content : '';
    const seen = new Set<number>();
    const chosen = (text.match(/\d+/g) ?? [])
      .map(Number)
      .filter((n) => n < pool.length && !seen.has(n) && seen.add(n));

    // Append any indices the model omitted, so we always return topK and never
    // drop a candidate just because the model listed fewer than asked.
    const rest = pool.map((_, i) => i).filter((i) => !seen.has(i));
    return [...chosen, ...rest].slice(0, topK).map((i) => pool[i]);
  },
  { name: 'rerank' }
);

// Union retrieval result lists by chunk id, keeping the highest score per chunk.
function mergeByMaxScore(lists: PineconeMatch[][]): PineconeMatch[] {
  const byId = new Map<string, PineconeMatch>();
  for (const list of lists) {
    for (const m of list) {
      const existing = byId.get(m.id);
      if (!existing || m.score > existing.score) byId.set(m.id, m);
    }
  }
  return Array.from(byId.values());
}

/**
 * Retrieve-and-rerank with multi-query recall and date-aware hybrid filtering:
 * expand the query into several phrasings, extract any temporal constraint, then
 * retrieve a deep pool for each phrasing (scoped to the date range when present),
 * union by chunk id, and LLM-rerank against the original question. Multi-query
 * broadens recall, the date filter sharpens precision on time-scoped questions,
 * and reranking does the final ordering.
 */
export const retrieveAndRerank = traceable(
  async function retrieveAndRerank(
    query: string,
    topK = 5,
    minScore = 0.7
  ): Promise<PineconeMatch[]> {
    // Date filtering only applies on the postgres backend (real date column);
    // skip the extraction call entirely on the pinecone backend.
    const wantDates =
      (process.env.VECTOR_BACKEND || 'pinecone').toLowerCase() === 'postgres';

    const [variations, dateRange] = await Promise.all([
      expandQuery(query),
      wantDates ? extractDateRange(query) : Promise.resolve(null),
    ]);

    const fetchK = Math.max(topK * 2, 10);
    const filter: VectorFilter | undefined = dateRange ? { dateRange } : undefined;

    let pool = mergeByMaxScore(
      await Promise.all(variations.map((v) => retrieve(v, fetchK, minScore, filter)))
    );

    // Filtered-with-fallback: a wrong or over-narrow date constraint shouldn't
    // be able to starve retrieval. If the date-scoped pool is thin, retry
    // unfiltered so there are always enough candidates to rerank.
    if (filter && pool.length < topK) {
      pool = mergeByMaxScore(
        await Promise.all(variations.map((v) => retrieve(v, fetchK, minScore)))
      );
    }

    return rerank(query, pool, topK);
  },
  { name: 'retrieveAndRerank' }
);

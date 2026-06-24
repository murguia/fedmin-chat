import { Pool } from 'pg';
import type { PineconeMatch, ChunkMetadata } from '@/types';

// Module-scoped pool so warm serverless instances reuse connections. Point
// DATABASE_URL at a transaction-mode pooler (PgBouncer / Supabase :6543 /
// Neon -pooler host) so total connections stay bounded across instances.
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 10_000,
    });
  }
  return pool;
}

// Backend-agnostic filter, translated per-backend by lib/vector-search.ts.
// dateRange (start/end as 'YYYY-MM-DD') is the enabler for Phase 1 hybrid search.
export interface VectorFilter {
  meetingId?: string;
  dateRange?: { start: string; end: string };
}

/**
 * Vector search over Postgres + pgvector. Mirrors queryPinecone's signature and
 * return shape (PineconeMatch[]) so it drops in behind the retrieval seam.
 *
 * score = 1 - cosine_distance, matching Pinecone's cosine similarity, so the
 * existing minScore thresholds (0.7 / 0.5) and citation "% match" keep their meaning.
 */
export async function queryVectors(
  embedding: number[],
  topK = 5,
  minScore = 0.7,
  filter?: VectorFilter
): Promise<PineconeMatch[]> {
  const vec = `[${embedding.join(',')}]`;
  const params: unknown[] = [vec];
  const conds: string[] = [];

  if (filter?.meetingId) {
    params.push(filter.meetingId);
    conds.push(`meeting_id = $${params.length}`);
  }
  if (filter?.dateRange) {
    params.push(filter.dateRange.start);
    const startIdx = params.length;
    params.push(filter.dateRange.end);
    conds.push(`meeting_date BETWEEN $${startIdx} AND $${params.length}`);
  }
  params.push(topK);
  const limitIdx = params.length;

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const sql = `
    SELECT id, text, meeting_id,
           to_char(meeting_date, 'YYYY-MM-DD') AS date,
           meeting_type, attendees, topics, decisions_summary,
           chunk_index, total_chunks,
           1 - (embedding <=> $1::halfvec) AS score
    FROM chunks
    ${where}
    ORDER BY embedding <=> $1::halfvec
    LIMIT $${limitIdx}`;

  const { rows } = await getPool().query(sql, params);

  return rows
    .filter((r) => Number(r.score) >= minScore)
    .map((r) => ({
      id: r.id,
      score: Number(r.score),
      metadata: {
        text: r.text,
        meeting_id: r.meeting_id,
        date: r.date ?? '',
        meeting_type: r.meeting_type,
        // attendees/topics are jsonb in PG; ChunkMetadata expects JSON strings
        // (citations call JSON.parse on them), so re-stringify if pg parsed them.
        attendees: typeof r.attendees === 'string' ? r.attendees : JSON.stringify(r.attendees ?? []),
        topics: typeof r.topics === 'string' ? r.topics : JSON.stringify(r.topics ?? []),
        decisions_summary: r.decisions_summary ?? '',
        chunk_index: r.chunk_index,
        total_chunks: r.total_chunks,
      } as ChunkMetadata,
    }));
}

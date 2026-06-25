import type { PineconeMatch } from '@/types';
import { queryPinecone } from './pinecone';
import { queryVectors, type VectorFilter } from './db';

export type { VectorFilter };

/**
 * Backend dispatcher behind the retrieval seam. VECTOR_BACKEND selects the store
 * (default 'pinecone'); flip to 'postgres' to A/B the two with the same eval.
 * Both return PineconeMatch[] with cosine-similarity scores, so callers
 * (lib/retrieve.ts) don't care which backend served the query.
 */
export async function vectorSearch(
  embedding: number[],
  topK = 5,
  minScore = 0.7,
  filter?: VectorFilter
): Promise<PineconeMatch[]> {
  const backend = (process.env.VECTOR_BACKEND || 'pinecone').toLowerCase();

  if (backend === 'postgres') {
    return queryVectors(embedding, topK, minScore, filter);
  }

  // Pinecone: translate the normalized filter into Pinecone metadata syntax.
  // dateRange is not supported on the Pinecone backend (string dates can't be
  // range-filtered) and is ignored here — it activates on the postgres backend.
  const pineconeFilter = filter?.meetingId
    ? { meeting_id: { $eq: filter.meetingId } }
    : undefined;

  return queryPinecone(embedding, topK, minScore, pineconeFilter);
}

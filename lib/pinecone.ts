import { Pinecone } from '@pinecone-database/pinecone';
import type { ChunkMetadata, PineconeMatch } from '@/types';

let pineconeClient: Pinecone | null = null;

export function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
  }
  return pineconeClient;
}

export function getIndex() {
  const client = getPineconeClient();
  const indexName = process.env.PINECONE_INDEX_NAME || 'fedmin-chat';
  return client.index<ChunkMetadata>(indexName);
}

export async function queryPinecone(
  embedding: number[],
  topK: number = 5,
  minScore: number = 0.7
): Promise<PineconeMatch[]> {
  const index = getIndex();

  const results = await index.query({
    vector: embedding,
    topK,
    includeMetadata: true,
  });

  return (results.matches || [])
    .filter((match) => (match.score || 0) >= minScore)
    .map((match) => ({
      id: match.id,
      score: match.score || 0,
      metadata: match.metadata as ChunkMetadata,
    }));
}

export async function upsertVectors(
  vectors: {
    id: string;
    values: number[];
    metadata: ChunkMetadata;
  }[]
) {
  const index = getIndex();

  // Upsert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    await index.upsert({ records: batch });
    console.log(`Upserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectors.length / batchSize)}`);
  }
}

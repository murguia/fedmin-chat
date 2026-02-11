/**
 * Ingest Fed Minutes data into Pinecone
 *
 * Usage:
 *   npx tsx scripts/ingest.ts                    # Full ingestion
 *   npx tsx scripts/ingest.ts --dry-run          # Test without API calls
 *   npx tsx scripts/ingest.ts --limit 5          # Process only 5 meetings
 *   npx tsx scripts/ingest.ts --data path/to/data.json  # Custom data path
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { encoding_for_model } from 'tiktoken';

// Types - matches FedMinutes output schema
interface RawMeetingData {
  filename: string;
  date: string;
  meeting_type?: string;
  attendees?: string; // JSON string of attendee objects
  topics?: string; // JSON string of topic objects
  decisions?: string; // JSON string of decisions
  raw_text: string;
}

interface Attendee {
  name: string;
  title?: string;
  organization?: string;
  role?: string;
}

interface Topic {
  title?: string;
  topic?: string;
  content?: string;
}

interface ChunkMetadata {
  text: string;
  meeting_id: string;
  date: string;
  meeting_type: string;
  attendees: string;
  topics: string;
  decisions_summary: string;
  chunk_index: number;
  total_chunks: number;
  [key: string]: string | number | boolean | string[];
}

interface Chunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

// Configuration
const CHUNK_SIZE = 500; // tokens
const CHUNK_OVERLAP = 50; // tokens
const EMBEDDING_MODEL = 'text-embedding-ada-002';
const BATCH_SIZE = 100;

// Text Chunker
class TextChunker {
  private encoder: ReturnType<typeof encoding_for_model>;

  constructor() {
    this.encoder = encoding_for_model('gpt-4');
  }

  countTokens(text: string): number {
    return this.encoder.encode(text).length;
  }

  chunk(text: string, maxTokens: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.countTokens(sentence);

      if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));

        // Keep overlap
        const overlapSentences: string[] = [];
        let overlapTokens = 0;
        for (let i = currentChunk.length - 1; i >= 0 && overlapTokens < overlap; i--) {
          overlapSentences.unshift(currentChunk[i]);
          overlapTokens += this.countTokens(currentChunk[i]);
        }
        currentChunk = overlapSentences;
        currentTokens = overlapTokens;
      }

      currentChunk.push(sentence);
      currentTokens += sentenceTokens;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }

    return chunks;
  }

  free() {
    this.encoder.free();
  }
}

// Embedding Generator
class EmbeddingGenerator {
  private openai: OpenAI;
  private dryRun: boolean;

  constructor(dryRun: boolean = false) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.dryRun = dryRun;
  }

  async generate(texts: string[]): Promise<number[][]> {
    if (this.dryRun) {
      console.log(`  [DRY RUN] Would generate embeddings for ${texts.length} texts`);
      return texts.map(() => new Array(1536).fill(0));
    }

    const response = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    return response.data.map((d) => d.embedding);
  }
}

// Pinecone Manager
class PineconeManager {
  private client: Pinecone | null = null;
  private indexName: string;
  private dryRun: boolean;

  constructor(indexName: string, dryRun: boolean = false) {
    this.indexName = indexName;
    this.dryRun = dryRun;
  }

  async init() {
    if (this.dryRun) {
      console.log('[DRY RUN] Skipping Pinecone initialization');
      return;
    }

    this.client = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
  }

  async upsert(vectors: { id: string; values: number[]; metadata: ChunkMetadata }[]) {
    if (this.dryRun) {
      console.log(`  [DRY RUN] Would upsert ${vectors.length} vectors`);
      return;
    }

    if (!this.client) {
      throw new Error('Pinecone client not initialized');
    }

    const index = this.client.index<ChunkMetadata>(this.indexName);

    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
      const batch = vectors.slice(i, i + BATCH_SIZE);
      await index.upsert({ records: batch });
      console.log(`  Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(vectors.length / BATCH_SIZE)}`);
    }
  }
}

// Main ingestion function
async function ingest(options: {
  dataPath: string;
  dryRun: boolean;
  limit?: number;
}) {
  const { dataPath, dryRun, limit } = options;

  console.log('=== Fed Minutes Ingestion ===');
  console.log(`Data path: ${dataPath}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Limit: ${limit || 'none'}`);
  console.log('');

  // Load data
  if (!fs.existsSync(dataPath)) {
    console.error(`Data file not found: ${dataPath}`);
    console.log('\nRun fetch-fedminutes.ts first or provide a valid data path.');
    process.exit(1);
  }

  const rawData = fs.readFileSync(dataPath, 'utf-8');
  let meetings: RawMeetingData[] = JSON.parse(rawData);

  if (limit) {
    meetings = meetings.slice(0, limit);
  }

  console.log(`Loaded ${meetings.length} meetings`);

  // Initialize components
  const chunker = new TextChunker();
  const embedder = new EmbeddingGenerator(dryRun);
  const pinecone = new PineconeManager(
    process.env.PINECONE_INDEX_NAME || 'fedmin-chat',
    dryRun
  );

  await pinecone.init();

  // Process meetings
  const allChunks: Chunk[] = [];

  for (const meeting of meetings) {
    // Parse JSON string fields
    let attendeeNames: string[] = [];
    try {
      const attendees: Attendee[] = JSON.parse(meeting.attendees || '[]');
      attendeeNames = attendees.map((a) => a.name).filter(Boolean);
    } catch {
      attendeeNames = [];
    }

    let topicTitles: string[] = [];
    try {
      const topics: Topic[] = JSON.parse(meeting.topics || '[]');
      topicTitles = topics.map((t) => t.title || t.topic || '').filter(Boolean);
    } catch {
      topicTitles = [];
    }

    let decisionsSummary = '';
    try {
      const decisions = JSON.parse(meeting.decisions || '[]');
      if (Array.isArray(decisions)) {
        decisionsSummary = decisions.slice(0, 5).join('; ');
      }
    } catch {
      decisionsSummary = '';
    }

    const textChunks = chunker.chunk(meeting.raw_text);

    for (let i = 0; i < textChunks.length; i++) {
      const chunkId = `${meeting.filename}-chunk-${i}`;
      allChunks.push({
        id: chunkId,
        text: textChunks[i],
        metadata: {
          text: textChunks[i],
          meeting_id: meeting.filename,
          date: meeting.date,
          meeting_type: meeting.meeting_type || 'regular',
          attendees: JSON.stringify(attendeeNames),
          topics: JSON.stringify(topicTitles.slice(0, 10)), // Limit to avoid metadata size issues
          decisions_summary: decisionsSummary,
          chunk_index: i,
          total_chunks: textChunks.length,
        },
      });
    }
  }

  console.log(`Generated ${allChunks.length} chunks`);
  console.log(`Average chunks per meeting: ${(allChunks.length / meetings.length).toFixed(1)}`);
  console.log('');

  // Generate embeddings and upsert in batches
  const EMBEDDING_BATCH_SIZE = 100;

  for (let i = 0; i < allChunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = allChunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchNum = Math.floor(i / EMBEDDING_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allChunks.length / EMBEDDING_BATCH_SIZE);

    console.log(`Processing batch ${batchNum}/${totalBatches}...`);

    // Generate embeddings
    const texts = batch.map((c) => c.text);
    const embeddings = await embedder.generate(texts);

    // Prepare vectors
    const vectors = batch.map((chunk, idx) => ({
      id: chunk.id,
      values: embeddings[idx],
      metadata: chunk.metadata,
    }));

    // Upsert to Pinecone
    await pinecone.upsert(vectors);
  }

  chunker.free();

  console.log('');
  console.log('=== Ingestion Complete ===');
  console.log(`Total chunks processed: ${allChunks.length}`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;
const dataIdx = args.indexOf('--data');
const dataPath = dataIdx !== -1
  ? args[dataIdx + 1]
  : path.join(process.cwd(), 'data', 'meetings_full.json');

ingest({ dataPath, dryRun, limit });

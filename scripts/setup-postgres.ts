/**
 * Create the pgvector schema for fedmin-chat.
 *
 * Usage:
 *   npx tsx scripts/setup-postgres.ts
 *
 * Requires DATABASE_URL (a Postgres instance with permission to CREATE EXTENSION).
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { poolConfig } from '../lib/db';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new Pool(poolConfig());

  console.log('Creating pgvector extension...');
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

  console.log('Creating chunks table...');
  // halfvec (16-bit) instead of vector (32-bit) halves embedding storage so the
  // full corpus fits a 500MB free tier. Precision loss is negligible for cosine
  // retrieval, and reranking cleans it up downstream.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chunks (
      id                text PRIMARY KEY,
      embedding         halfvec(1536),
      text              text NOT NULL,
      meeting_id        text NOT NULL,
      meeting_date      date,
      meeting_type      text,
      attendees         jsonb,
      topics            jsonb,
      decisions_summary text,
      chunk_index       int,
      total_chunks      int
    )
  `);

  // No ANN index on the embedding: at ~61k rows exact (sequential-scan) cosine
  // search is fast enough, and an HNSW/ivfflat index would blow the free-tier
  // storage budget. Add one (e.g. hnsw … halfvec_cosine_ops) on a larger tier.

  console.log('Creating btree index on meeting_date...');
  await pool.query(
    'CREATE INDEX IF NOT EXISTS chunks_meeting_date_idx ON chunks (meeting_date)'
  );

  console.log('Schema ready.');
  await pool.end();
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});

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

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('Creating pgvector extension...');
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

  console.log('Creating chunks table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chunks (
      id                text PRIMARY KEY,
      embedding         vector(1536),
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

  console.log('Creating HNSW index on embedding (cosine)...');
  await pool.query(
    'CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops)'
  );

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

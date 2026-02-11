/**
 * Create the Pinecone index for fedmin-chat
 *
 * Usage:
 *   npx tsx scripts/setup-pinecone.ts
 *
 * Requires PINECONE_API_KEY in .env or environment
 */

import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';

const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'fedmin-chat';
const DIMENSION = 1536; // OpenAI text-embedding-ada-002 output size

async function setup() {
  if (!process.env.PINECONE_API_KEY) {
    console.error('Error: PINECONE_API_KEY environment variable is required');
    process.exit(1);
  }

  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  // Check if index already exists
  const existingIndexes = await pinecone.listIndexes();
  const indexExists = existingIndexes.indexes?.some((idx) => idx.name === INDEX_NAME);

  if (indexExists) {
    console.log(`Index "${INDEX_NAME}" already exists.`);
    const description = await pinecone.describeIndex(INDEX_NAME);
    console.log('Index details:', JSON.stringify(description, null, 2));
    return;
  }

  console.log(`Creating index "${INDEX_NAME}" with ${DIMENSION} dimensions...`);

  await pinecone.createIndex({
    name: INDEX_NAME,
    dimension: DIMENSION,
    metric: 'cosine',
    spec: {
      serverless: {
        cloud: 'aws',
        region: 'us-east-1',
      },
    },
  });

  console.log('Index created successfully!');
  console.log('Waiting for index to be ready...');

  // Wait for index to be ready
  let ready = false;
  while (!ready) {
    const description = await pinecone.describeIndex(INDEX_NAME);
    ready = description.status?.ready === true;
    if (!ready) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      process.stdout.write('.');
    }
  }

  console.log('\nIndex is ready!');
}

setup().catch(console.error);

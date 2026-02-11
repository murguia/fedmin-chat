/**
 * Fetch Fed Minutes data from the FedMinutes repository
 *
 * Usage:
 *   npx tsx scripts/fetch-fedminutes.ts
 *
 * This will download the parsed meeting data to the data/ directory.
 * Alternatively, copy your local FedMinutes parsed data to data/meetings_full.json
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const FEDMINUTES_RAW_URL = 'https://raw.githubusercontent.com';
const DEFAULT_REPO = 'your-username/FedMinutes'; // Update with actual repo
const DEFAULT_BRANCH = 'main';
const DATA_FILE = 'output/meetings_full.json';

async function fetchFedMinutes(
  repo: string = DEFAULT_REPO,
  branch: string = DEFAULT_BRANCH
): Promise<void> {
  const url = `${FEDMINUTES_RAW_URL}/${repo}/${branch}/${DATA_FILE}`;
  const outputPath = path.join(process.cwd(), 'data', 'meetings_full.json');

  console.log(`Fetching Fed Minutes data from: ${url}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const data = await response.text();

    // Validate JSON
    JSON.parse(data);

    // Ensure data directory exists
    const dataDir = path.dirname(outputPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, data);
    console.log(`Successfully saved to: ${outputPath}`);

    // Print summary
    const meetings = JSON.parse(data);
    if (Array.isArray(meetings)) {
      console.log(`Total meetings: ${meetings.length}`);
    }
  } catch (error) {
    console.error('Error fetching Fed Minutes data:', error);
    console.log('\nAlternative: Copy your local FedMinutes parsed data to:');
    console.log(`  ${outputPath}`);
    console.log('\nExpected format: Array of meeting objects with fields:');
    console.log('  - filename, date, content, meeting_type, attendees, topics, decisions_summary');
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const repo = args[0] || DEFAULT_REPO;
const branch = args[1] || DEFAULT_BRANCH;

fetchFedMinutes(repo, branch);

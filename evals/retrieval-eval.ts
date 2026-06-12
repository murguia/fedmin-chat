/**
 * Retrieval-accuracy eval harness
 *
 * Runs a golden set of questions through the retrieval primitive
 * (embedding -> Pinecone search) and scores how well it surfaces the
 * passages a correct answer depends on. This evaluates retrieval in
 * isolation from generation, the way recall@k / MRR are meant to be read.
 *
 * Requires OPENAI_API_KEY and PINECONE_API_KEY (queries the live index).
 *
 * Usage:
 *   npx tsx evals/retrieval-eval.ts                     # default top-k 5
 *   npx tsx evals/retrieval-eval.ts --top-k 10          # widen retrieval
 *   npx tsx evals/retrieval-eval.ts --threshold 0.8     # gate strictness
 *   npx tsx evals/retrieval-eval.ts --data path.json    # custom golden set
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { generateEmbedding } from '../lib/openai';
import { queryPinecone } from '../lib/pinecone';

interface EvalCase {
  id: string;
  question: string;
  expected_keywords?: string[];
  expected_meetings?: string[];
  notes?: string;
}

interface CaseResult {
  id: string;
  keywordRecall: number | null; // null when the case has no keyword labels
  missingKeywords: string[];
  meetingHit: boolean | null; // null when the case has no meeting labels
  meetingReciprocalRank: number; // 0 when missed or unlabeled
  topScore: number;
}

function parseArgs(argv: string[]) {
  let topK = 5;
  let threshold = 0.7;
  let dataPath = path.join(__dirname, 'dataset.json');

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--top-k') topK = parseInt(argv[++i], 10);
    else if (arg === '--threshold') threshold = parseFloat(argv[++i]);
    else if (arg === '--data') dataPath = argv[++i];
  }

  return { topK, threshold, dataPath };
}

// First-seen rank order of unique meeting_ids across the ranked matches.
function rankedMeetingIds(meetingIds: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of meetingIds) {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  return ordered;
}

async function evaluateCase(c: EvalCase, topK: number): Promise<CaseResult> {
  const embedding = await generateEmbedding(c.question);
  // minScore 0: we want the full ranked top-k to judge retrieval, not a
  // production-style relevance cutoff.
  const matches = await queryPinecone(embedding, topK, 0);

  const retrievedText = matches.map((m) => m.metadata.text).join('\n').toLowerCase();
  const topScore = matches.length > 0 ? matches[0].score : 0;

  // Keyword coverage: fraction of expected substrings present in retrieved text.
  let keywordRecall: number | null = null;
  let missingKeywords: string[] = [];
  if (c.expected_keywords && c.expected_keywords.length > 0) {
    missingKeywords = c.expected_keywords.filter(
      (kw) => !retrievedText.includes(kw.toLowerCase())
    );
    keywordRecall =
      (c.expected_keywords.length - missingKeywords.length) /
      c.expected_keywords.length;
  }

  // Meeting hit + reciprocal rank of the first expected meeting.
  let meetingHit: boolean | null = null;
  let meetingReciprocalRank = 0;
  if (c.expected_meetings && c.expected_meetings.length > 0) {
    const ranked = rankedMeetingIds(matches.map((m) => m.metadata.meeting_id));
    const expected = new Set(c.expected_meetings);
    const rank = ranked.findIndex((id) => expected.has(id));
    meetingHit = rank !== -1;
    meetingReciprocalRank = rank === -1 ? 0 : 1 / (rank + 1);
  }

  return {
    id: c.id,
    keywordRecall,
    missingKeywords,
    meetingHit,
    meetingReciprocalRank,
    topScore,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function printReport(results: CaseResult[], topK: number, threshold: number): boolean {
  console.log(`\nRetrieval eval — top-k=${topK}, ${results.length} cases\n`);

  const idWidth = Math.max(...results.map((r) => r.id.length), 4);
  const header = `${'case'.padEnd(idWidth)}  kw-recall  meeting   top-score`;
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const r of results) {
    const kw = r.keywordRecall === null ? '   —   ' : pct(r.keywordRecall).padStart(7);
    const meeting =
      r.meetingHit === null ? '  —  ' : r.meetingHit ? ' hit ' : 'MISS ';
    const flag = r.missingKeywords.length > 0 ? `  (missing: ${r.missingKeywords.join(', ')})` : '';
    console.log(
      `${r.id.padEnd(idWidth)}  ${kw}    ${meeting}    ${r.topScore.toFixed(3)}${flag}`
    );
  }

  // Aggregates, each over the cases that carry the relevant label.
  const kwCases = results.filter((r) => r.keywordRecall !== null);
  const meetingCases = results.filter((r) => r.meetingHit !== null);

  const meanKeywordRecall =
    kwCases.reduce((s, r) => s + (r.keywordRecall ?? 0), 0) / (kwCases.length || 1);
  const meetingHitRate =
    meetingCases.filter((r) => r.meetingHit).length / (meetingCases.length || 1);
  const mrr =
    meetingCases.reduce((s, r) => s + r.meetingReciprocalRank, 0) /
    (meetingCases.length || 1);

  console.log('\nSummary');
  console.log(`  keyword recall (mean):  ${pct(meanKeywordRecall)}  over ${kwCases.length} cases`);
  if (meetingCases.length > 0) {
    console.log(`  meeting hit-rate:       ${pct(meetingHitRate)}  over ${meetingCases.length} cases`);
    console.log(`  meeting MRR:            ${mrr.toFixed(3)}`);
  }

  const passed = meanKeywordRecall >= threshold;
  console.log(
    `\nGate: keyword recall ${pct(meanKeywordRecall)} ${passed ? '>=' : '<'} ${pct(threshold)} threshold -> ${passed ? 'PASS' : 'FAIL'}\n`
  );
  return passed;
}

async function main() {
  const { topK, threshold, dataPath } = parseArgs(process.argv.slice(2));

  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const cases: EvalCase[] = raw.cases;

  console.log(`Running ${cases.length} cases from ${path.relative(process.cwd(), dataPath)}...`);

  // Sequential to stay well within API rate limits; the golden set is small.
  const results: CaseResult[] = [];
  for (const c of cases) {
    results.push(await evaluateCase(c, topK));
  }

  const passed = printReport(results, topK, threshold);
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error('Eval failed:', err);
  process.exit(1);
});

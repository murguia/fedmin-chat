/**
 * Retrieval-accuracy eval harness
 *
 * Runs a golden set of questions through retrieval and scores how well it
 * surfaces the passages a correct answer depends on — evaluated in isolation
 * from generation, the way recall@k / MRR are meant to be read.
 *
 * Compares two strategies side by side:
 *   - single   : one embedding -> Pinecone search
 *   - rerank   : multi-query recall + LLM reranking (retrieve-and-rerank)
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
import { retrieve, retrieveAndRerank } from '../lib/retrieve';
import { extractDateRange, type DateRange } from '../lib/date-filter';
import type { PineconeMatch } from '../types';

interface EvalCase {
  id: string;
  question: string;
  expected_keywords?: string[];
  expected_meetings?: string[];
  notes?: string;
}

interface Scored {
  keywordRecall: number | null; // null when the case has no keyword labels
  missingKeywords: string[];
  meetingHit: boolean | null; // null when the case has no meeting labels
  meetingReciprocalRank: number; // 0 when missed or unlabeled
  topScore: number;
}

interface CaseResult {
  id: string;
  single: Scored; // plain single-query
  hybrid: Scored; // single-query + date filter
  rerank: Scored; // full production path (multi-query + date + rerank)
  dateRange: DateRange | null;
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

function score(c: EvalCase, matches: PineconeMatch[]): Scored {
  const retrievedText = matches.map((m) => m.metadata.text).join('\n').toLowerCase();
  const topScore = matches.length > 0 ? matches[0].score : 0;

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

  let meetingHit: boolean | null = null;
  let meetingReciprocalRank = 0;
  if (c.expected_meetings && c.expected_meetings.length > 0) {
    const ranked = rankedMeetingIds(matches.map((m) => m.metadata.meeting_id));
    const expected = new Set(c.expected_meetings);
    const rank = ranked.findIndex((id) => expected.has(id));
    meetingHit = rank !== -1;
    meetingReciprocalRank = rank === -1 ? 0 : 1 / (rank + 1);
  }

  return { keywordRecall, missingKeywords, meetingHit, meetingReciprocalRank, topScore };
}

async function evaluateCase(c: EvalCase, topK: number): Promise<CaseResult> {
  // minScore 0: we want the full ranked top-k to judge retrieval, not a
  // production-style relevance cutoff.
  const dateRange = await extractDateRange(c.question);
  const filter = dateRange ? { dateRange } : undefined;
  const [single, hybrid, reranked] = await Promise.all([
    retrieve(c.question, topK, 0), // plain semantic
    retrieve(c.question, topK, 0, filter), // + date filter, isolates its effect
    retrieveAndRerank(c.question, topK, 0), // full production path
  ]);
  return {
    id: c.id,
    single: score(c, single),
    hybrid: score(c, hybrid),
    rerank: score(c, reranked),
    dateRange,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function meetingCell(s: Scored): string {
  if (s.meetingHit === null) return ' — ';
  return s.meetingHit ? 'hit ' : 'MISS';
}

function aggregate(results: CaseResult[], pick: (r: CaseResult) => Scored) {
  const scored = results.map(pick);
  const kwCases = scored.filter((s) => s.keywordRecall !== null);
  const meetingCases = scored.filter((s) => s.meetingHit !== null);
  return {
    keywordRecall:
      kwCases.reduce((sum, s) => sum + (s.keywordRecall ?? 0), 0) / (kwCases.length || 1),
    meetingHitRate:
      meetingCases.filter((s) => s.meetingHit).length / (meetingCases.length || 1),
    mrr:
      meetingCases.reduce((sum, s) => sum + s.meetingReciprocalRank, 0) /
      (meetingCases.length || 1),
    kwCount: kwCases.length,
    meetingCount: meetingCases.length,
  };
}

function printReport(results: CaseResult[], topK: number, threshold: number): boolean {
  console.log(`\nRetrieval eval — top-k=${topK}, ${results.length} cases  (meeting hit: single -> +date -> rerank)\n`);

  const idWidth = Math.max(...results.map((r) => r.id.length), 4);
  const header = `${'case'.padEnd(idWidth)}  single  +date  rerank   date range`;
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const r of results) {
    const cells = `${meetingCell(r.single)}    ${meetingCell(r.hybrid)}   ${meetingCell(r.rerank)}`;
    const dateTag = r.dateRange ? `   ${r.dateRange.start}..${r.dateRange.end}` : '';
    console.log(`${r.id.padEnd(idWidth)}  ${cells}${dateTag}`);
  }

  const s = aggregate(results, (r) => r.single);
  const h = aggregate(results, (r) => r.hybrid);
  const m = aggregate(results, (r) => r.rerank);

  console.log('\nSummary                  single -> +date -> rerank');
  if (m.meetingCount > 0) {
    console.log(`  meeting hit-rate:  ${pct(s.meetingHitRate)} -> ${pct(h.meetingHitRate)} -> ${pct(m.meetingHitRate)}   over ${m.meetingCount} cases`);
    console.log(`  meeting MRR:       ${s.mrr.toFixed(3)} -> ${h.mrr.toFixed(3)} -> ${m.mrr.toFixed(3)}`);
  }
  console.log(`  keyword recall:    ${pct(m.keywordRecall)} (rerank)   over ${m.kwCount} cases`);

  // Gate on the production retrieval path (rerank keyword recall).
  const passed = m.keywordRecall >= threshold;
  console.log(
    `\nGate: rerank keyword recall ${pct(m.keywordRecall)} ${passed ? '>=' : '<'} ${pct(threshold)} threshold -> ${passed ? 'PASS' : 'FAIL'}\n`
  );
  return passed;
}

async function main() {
  const { topK, threshold, dataPath } = parseArgs(process.argv.slice(2));

  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const cases: EvalCase[] = raw.cases;

  console.log(`Running ${cases.length} cases from ${path.relative(process.cwd(), dataPath)}...`);

  // Sequential across cases to stay well within API rate limits.
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

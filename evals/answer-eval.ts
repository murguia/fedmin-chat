/**
 * Answer-quality eval (LLM-as-judge)
 *
 * Runs the full agent on the golden questions and scores each generated answer
 * for faithfulness (is every claim supported by the retrieved excerpts?) and
 * relevance (does it answer the question?). This measures generation, not
 * retrieval — the complement to retrieval-eval.ts.
 *
 * The judge is itself an LLM (gpt-4o) and is imperfect; treat scores as a signal,
 * not ground truth. Requires OPENAI_API_KEY and the configured vector backend.
 *
 * Usage:
 *   VECTOR_BACKEND=postgres npx tsx evals/answer-eval.ts
 *   ... --threshold 4.0   # gate on mean faithfulness
 *   ... --limit 3         # only the first N cases
 *   ... --data path.json  # custom golden set
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { traceable } from 'langsmith/traceable';
import { z } from 'zod';
import { runAgentLoop } from '../lib/agent';
import type { PineconeMatch } from '../types';

interface EvalCase {
  id: string;
  question: string;
}

const JudgeSchema = z.object({
  faithfulness: z
    .number()
    .describe(
      '1-5: are ALL factual claims in the answer supported by the excerpts? ' +
        '5 = fully grounded, 1 = mostly unsupported. An answer that correctly ' +
        'states the excerpts lack the information is fully faithful (5).'
    ),
  relevance: z
    .number()
    .describe(
      '1-5: does the answer address the question? 5 = directly answers, ' +
        '1 = off-topic. Appropriately abstaining when excerpts are thin is relevant.'
    ),
  unsupported_claims: z
    .array(z.string())
    .describe('claims in the answer not supported by the excerpts; empty if fully grounded'),
  reasoning: z.string().describe('one or two sentences justifying the scores'),
});

type Verdict = z.infer<typeof JudgeSchema>;

let judge: ChatOpenAI | null = null;
function getJudge(): ChatOpenAI {
  if (!judge) judge = new ChatOpenAI({ model: 'gpt-4o', temperature: 0 });
  return judge;
}

// Give the judge the SAME evidence the agent saw: the full chunk text of every
// match the agent retrieved (deduped). Truncating here would make grounded
// claims look unsupported.
function buildContext(matches: PineconeMatch[]): string {
  if (matches.length === 0) return '(no excerpts were retrieved)';
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const m of matches) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    lines.push(`[${m.metadata.date}] ${m.metadata.text.trim()}`);
    if (lines.length >= 20) break;
  }
  return lines.join('\n\n');
}

const judgeAnswer = traceable(
  async function judgeAnswer(
    question: string,
    context: string,
    answer: string
  ): Promise<Verdict> {
    const model = getJudge().withStructuredOutput(JudgeSchema, { name: 'judge' });
    return model.invoke([
      new SystemMessage(
        `You are a strict evaluator of a retrieval-augmented answer about Federal
Reserve Board meeting minutes. You receive a QUESTION, the EXCERPTS the system
retrieved, and its ANSWER.

- faithfulness: are ALL factual claims in the answer supported by the excerpts?
  Penalize any claim not grounded in the excerpts, even if it happens to be true.
  An answer that correctly states the excerpts don't contain enough information
  is fully faithful.
- relevance: does the answer address the question? Appropriately abstaining when
  the excerpts are thin is relevant.
- List any unsupported claims you find.`
      ),
      new HumanMessage(
        `QUESTION:\n${question}\n\nEXCERPTS:\n${context}\n\nANSWER:\n${answer}`
      ),
    ]);
  },
  { name: 'judgeAnswer' }
);

interface CaseResult {
  id: string;
  verdict: Verdict;
}

function parseArgs(argv: string[]) {
  let threshold = 4.0;
  let limit: number | undefined;
  let dataPath = path.join(__dirname, 'dataset.json');
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--threshold') threshold = parseFloat(argv[++i]);
    else if (arg === '--limit') limit = parseInt(argv[++i], 10);
    else if (arg === '--data') dataPath = argv[++i];
  }
  return { threshold, limit, dataPath };
}

function printReport(results: CaseResult[], threshold: number): boolean {
  const idWidth = Math.max(...results.map((r) => r.id.length), 4);
  const header = `${'case'.padEnd(idWidth)}  faith  rel  unsupported`;
  console.log(`\nAnswer-quality eval — ${results.length} cases (LLM-as-judge)\n`);
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const r of results) {
    const n = r.verdict.unsupported_claims.length;
    console.log(
      `${r.id.padEnd(idWidth)}   ${r.verdict.faithfulness}     ${r.verdict.relevance}      ${n}`
    );
  }

  const meanFaith =
    results.reduce((s, r) => s + r.verdict.faithfulness, 0) / (results.length || 1);
  const meanRel =
    results.reduce((s, r) => s + r.verdict.relevance, 0) / (results.length || 1);
  const grounded = results.filter((r) => r.verdict.unsupported_claims.length === 0).length;

  console.log('\nSummary');
  console.log(`  mean faithfulness:  ${meanFaith.toFixed(2)} / 5`);
  console.log(`  mean relevance:     ${meanRel.toFixed(2)} / 5`);
  console.log(`  fully grounded:     ${grounded}/${results.length}`);

  // Surface any unsupported claims for inspection.
  const flagged = results.filter((r) => r.verdict.unsupported_claims.length > 0);
  if (flagged.length > 0) {
    console.log('\nUnsupported claims:');
    for (const r of flagged) {
      for (const claim of r.verdict.unsupported_claims) {
        console.log(`  [${r.id}] ${claim}`);
      }
    }
  }

  const passed = meanFaith >= threshold;
  console.log(
    `\nGate: mean faithfulness ${meanFaith.toFixed(2)} ${passed ? '>=' : '<'} ${threshold.toFixed(2)} -> ${passed ? 'PASS' : 'FAIL'}\n`
  );
  return passed;
}

async function main() {
  const { threshold, limit, dataPath } = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  let cases: EvalCase[] = raw.cases;
  if (limit) cases = cases.slice(0, limit);

  console.log(`Running ${cases.length} cases through the agent + judge...`);

  const results: CaseResult[] = [];
  for (const c of cases) {
    const { response, matches } = await runAgentLoop(c.question);
    const verdict = await judgeAnswer(c.question, buildContext(matches), response);
    results.push({ id: c.id, verdict });
    console.log(`  ${c.id}: faith=${verdict.faithfulness} rel=${verdict.relevance}`);
  }

  const passed = printReport(results, threshold);
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error('Answer eval failed:', err);
  process.exit(1);
});

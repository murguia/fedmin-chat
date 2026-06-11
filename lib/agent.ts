import OpenAI from 'openai';
import { getOpenAIClient } from './openai';
import { toolDefinitions, executeTool } from './tools';
import type { PineconeMatch } from '@/types';

const MAX_STEPS = 4;

const AGENT_SYSTEM_PROMPT = `You are a research assistant exploring Federal Reserve Board
meeting minutes from 1967-1973. You answer questions by searching the minutes with the
tools provided.

Historical context: this period covers the collapse of Bretton Woods, the Nixon Shock
(Aug 1971), rising inflation, and the shift from fixed to floating exchange rates.

HOW TO RESEARCH:
- Always search before answering. Never answer from prior knowledge.
- Issue multiple searches when a question spans several topics, people, or time periods,
  or when the first results are thin.
- Use search_within_meeting to drill into a specific meeting you found relevant.

GROUNDING RULES:
- Base every claim ONLY on returned excerpts. Do NOT infer facts, names, or decisions
  that are not explicitly stated in them.
- If the excerpts don't contain enough information to answer, say so clearly.

WHEN YOU HAVE ENOUGH EVIDENCE, write the answer:
- Start with a concise summary (bullet points if the question is broad, a direct answer
  if it is narrow).
- Follow with detailed prose using specific dates, attendees, and decisions from the
  excerpts.`;

/**
 * Runs a tool-calling research loop: the model plans and issues searches against the
 * minutes, reads the results, and decides when it has enough evidence to answer.
 * Returns the final answer plus every match retrieved along the way (for citations).
 */
export async function runAgentLoop(
  query: string
): Promise<{ response: string; matches: PineconeMatch[] }> {
  const openai = getOpenAIClient();
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: query },
  ];

  const collectedMatches: PineconeMatch[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: toolDefinitions,
      // Force at least one search on the first turn so answers are always grounded.
      tool_choice: step === 0 ? 'required' : 'auto',
      temperature: 0.3,
      max_tokens: 1500,
    });

    const choice = completion.choices[0].message;
    messages.push(choice);

    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      return {
        response: choice.content || 'Unable to generate response.',
        matches: collectedMatches,
      };
    }

    for (const call of choice.tool_calls) {
      if (call.type !== 'function') continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }
      const result = await executeTool(call.function.name, args);
      collectedMatches.push(...result.matches);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: result.content,
      });
    }
  }

  // Step budget exhausted: ask for a final answer with no further tool calls.
  const final = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      ...messages,
      {
        role: 'user',
        content: 'Provide your final answer now, based only on the excerpts gathered so far.',
      },
    ],
    temperature: 0.3,
    max_tokens: 1500,
  });

  return {
    response: final.choices[0].message.content || 'Unable to generate response.',
    matches: collectedMatches,
  };
}

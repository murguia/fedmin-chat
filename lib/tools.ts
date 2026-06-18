import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { retrieve, retrieveAndRerank } from './retrieve';
import type { PineconeMatch } from '@/types';

function clampTopK(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.min(Math.max(Math.trunc(n), 1), 10);
}

// Render matches into a compact, model-readable block. meeting_id is included so
// the agent can follow up with search_within_meeting to drill into a meeting.
function formatMatches(matches: PineconeMatch[]): string {
  if (matches.length === 0) {
    return 'No matching excerpts found. Try a different query or broaden your search.';
  }
  return matches
    .map((m, i) => {
      const md = m.metadata;
      return `[Excerpt ${i + 1}] meeting_id=${md.meeting_id} | date=${md.date} | type=${md.meeting_type} | relevance=${m.score.toFixed(2)}
${md.text}`;
    })
    .join('\n\n---\n\n');
}

// Tools return [content, artifact]: the content string goes to the model, while
// the artifact (raw matches) rides along on the ToolMessage so the agent loop
// can collect it into user-facing citations without re-parsing the text.

export const searchMinutes = tool(
  async ({ query, top_k }): Promise<[string, PineconeMatch[]]> => {
    const matches = await retrieveAndRerank(query, clampTopK(top_k), 0.7);
    return [formatMatches(matches), matches];
  },
  {
    name: 'search_minutes',
    description:
      'Semantic search over Federal Reserve Board meeting minutes (1967-1973). ' +
      'Returns the most relevant excerpts, each tagged with its meeting_id, date, ' +
      'type, and relevance score. Call this to find passages about a topic, event, ' +
      'person, or policy decision. Issue several searches with different queries ' +
      'when a question spans multiple topics or time periods, or when results are thin.',
    schema: z.object({
      query: z
        .string()
        .describe('A focused natural-language query describing what to find.'),
      top_k: z
        .number()
        .int()
        .optional()
        .describe('Number of excerpts to return (1-10). Default 5.'),
    }),
    responseFormat: 'content_and_artifact',
  }
);

export const searchWithinMeeting = tool(
  async ({ meeting_id, query, top_k }): Promise<[string, PineconeMatch[]]> => {
    // Lower minScore: within one meeting the best available passages are still
    // worth surfacing even if absolute relevance is modest.
    const matches = await retrieve(query, clampTopK(top_k), 0.5, {
      meeting_id: { $eq: meeting_id },
    });
    return [formatMatches(matches), matches];
  },
  {
    name: 'search_within_meeting',
    description:
      'Semantic search scoped to a single meeting, identified by its meeting_id ' +
      '(e.g. "NT50000.txt"). Use this to drill into a specific meeting you found ' +
      'relevant via search_minutes and pull more detail from it.',
    schema: z.object({
      meeting_id: z
        .string()
        .describe('The meeting_id to search within, e.g. "NT50000.txt".'),
      query: z
        .string()
        .describe('A focused natural-language query describing what to find.'),
      top_k: z
        .number()
        .int()
        .optional()
        .describe('Number of excerpts to return (1-10). Default 5.'),
    }),
    responseFormat: 'content_and_artifact',
  }
);

export const tools = [searchMinutes, searchWithinMeeting];

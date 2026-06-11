import OpenAI from 'openai';
import { generateEmbedding } from './openai';
import { queryPinecone } from './pinecone';
import type { PineconeMatch } from '@/types';

// Tool schemas exposed to the model for the agentic research loop.
export const toolDefinitions: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_minutes',
      description:
        'Semantic search over Federal Reserve Board meeting minutes (1967-1973). ' +
        'Returns the most relevant excerpts, each tagged with its meeting_id, date, ' +
        'type, and relevance score. Call this to find passages about a topic, event, ' +
        'person, or policy decision. Issue several searches with different queries ' +
        'when a question spans multiple topics or time periods, or when results are thin.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'A focused natural-language query describing what to find.',
          },
          top_k: {
            type: 'integer',
            description: 'Number of excerpts to return (1-10). Default 5.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_within_meeting',
      description:
        'Semantic search scoped to a single meeting, identified by its meeting_id ' +
        '(e.g. "NT50000.txt"). Use this to drill into a specific meeting you found ' +
        'relevant via search_minutes and pull more detail from it.',
      parameters: {
        type: 'object',
        properties: {
          meeting_id: {
            type: 'string',
            description: 'The meeting_id to search within, e.g. "NT50000.txt".',
          },
          query: {
            type: 'string',
            description: 'A focused natural-language query describing what to find.',
          },
          top_k: {
            type: 'integer',
            description: 'Number of excerpts to return (1-10). Default 5.',
          },
        },
        required: ['meeting_id', 'query'],
      },
    },
  },
];

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

// Executes a tool call and returns both a model-facing string and the raw
// matches, which the agent loop accumulates into user-facing citations.
export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: string; matches: PineconeMatch[] }> {
  switch (name) {
    case 'search_minutes': {
      const query = String(args.query ?? '').trim();
      if (!query) return { content: 'Error: query is required.', matches: [] };
      const embedding = await generateEmbedding(query);
      const matches = await queryPinecone(embedding, clampTopK(args.top_k), 0.7);
      return { content: formatMatches(matches), matches };
    }
    case 'search_within_meeting': {
      const meetingId = String(args.meeting_id ?? '').trim();
      const query = String(args.query ?? '').trim();
      if (!meetingId || !query) {
        return { content: 'Error: meeting_id and query are required.', matches: [] };
      }
      const embedding = await generateEmbedding(query);
      // Lower minScore: within one meeting the best available passages are still
      // worth surfacing even if absolute relevance is modest.
      const matches = await queryPinecone(embedding, clampTopK(args.top_k), 0.5, {
        meeting_id: { $eq: meetingId },
      });
      return { content: formatMatches(matches), matches };
    }
    default:
      return { content: `Unknown tool: ${name}`, matches: [] };
  }
}

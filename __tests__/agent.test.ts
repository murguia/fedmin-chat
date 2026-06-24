/**
 * Tests for the LangGraph research agent (lib/agent.ts).
 *
 * Two boundaries are mocked: the chat model (@langchain/openai ChatOpenAI) and
 * the retrieval module (lib/retrieve). The real LangGraph state machine and the
 * real LangChain tools (lib/tools.ts) run against those mocks, so no API keys or
 * network calls are involved. We drive the loop by queuing the AIMessages the
 * "model" should return on each turn.
 */

import { AIMessage } from '@langchain/core/messages';
import type { PineconeMatch } from '@/types';

const mockBindTools = jest.fn();
const mockInvoke = jest.fn();
const mockRetrieve = jest.fn();
const mockRetrieveAndRerank = jest.fn();

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    bindTools: (...args: unknown[]) => {
      mockBindTools(...args);
      return { invoke: mockInvoke };
    },
    invoke: mockInvoke,
  })),
}));

jest.mock('@/lib/retrieve', () => ({
  retrieve: (...args: unknown[]) => mockRetrieve(...args),
  retrieveAndRerank: (...args: unknown[]) => mockRetrieveAndRerank(...args),
}));

import { runAgentLoop } from '@/lib/agent';

// --- helpers ---

// Unique-by-default ids: LangGraph's message reducer dedupes by id, so reusing
// an id across turns would silently drop a tool result.
let callSeq = 0;

function aiToolCall(
  calls: { name: string; args: Record<string, unknown>; id?: string }[]
): AIMessage {
  return new AIMessage({
    content: '',
    tool_calls: calls.map((c) => ({
      name: c.name,
      args: c.args,
      id: c.id ?? `call_${callSeq++}`,
      type: 'tool_call',
    })),
  });
}

function aiText(content: string): AIMessage {
  return new AIMessage({ content });
}

function match(id: string, score = 0.9): PineconeMatch {
  return {
    id,
    score,
    metadata: {
      text: `excerpt ${id}`,
      meeting_id: 'NT50808.txt',
      date: '1971-08-15',
      meeting_type: 'regular',
      attendees: '[]',
      topics: '[]',
      decisions_summary: '',
      chunk_index: 0,
      total_chunks: 1,
    },
  };
}

describe('runAgentLoop (LangGraph)', () => {
  beforeEach(() => {
    mockBindTools.mockReset();
    mockInvoke.mockReset();
    mockRetrieve.mockReset();
    mockRetrieveAndRerank.mockReset();
    mockRetrieve.mockResolvedValue([match('a')]);
    mockRetrieveAndRerank.mockResolvedValue([match('a')]);
  });

  it('searches once, then synthesizes an answer', async () => {
    mockInvoke
      .mockResolvedValueOnce(aiToolCall([{ name: 'search_minutes', args: { query: 'inflation' } }]))
      .mockResolvedValueOnce(aiText('Inflation rose sharply in 1971.'));

    const res = await runAgentLoop('What happened with inflation?');

    expect(res.response).toBe('Inflation rose sharply in 1971.');
    expect(res.matches).toHaveLength(1);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    // search_minutes routes through retrieve-and-rerank at topK=5, minScore 0.7
    expect(mockRetrieveAndRerank).toHaveBeenCalledWith('inflation', 5, 0.7);
  });

  it('forces a tool call on the first turn, then allows free choice', async () => {
    mockInvoke
      .mockResolvedValueOnce(aiToolCall([{ name: 'search_minutes', args: { query: 'gold' } }]))
      .mockResolvedValueOnce(aiText('done'));

    await runAgentLoop('q');

    // First model turn binds tools with tool_choice 'any' (forced search);
    // the second turn binds tools without forcing.
    expect(mockBindTools.mock.calls[0][1]).toEqual({ tool_choice: 'any' });
    expect(mockBindTools.mock.calls[1][1]).toBeUndefined();
  });

  it('drills into a meeting with a scoped, filtered search', async () => {
    mockRetrieveAndRerank.mockResolvedValueOnce([match('a')]);
    mockRetrieve.mockResolvedValueOnce([match('b')]);

    mockInvoke
      .mockResolvedValueOnce(aiToolCall([{ name: 'search_minutes', args: { query: 'gold' } }]))
      .mockResolvedValueOnce(
        aiToolCall([
          {
            name: 'search_within_meeting',
            args: { meeting_id: 'NT50808.txt', query: 'convertibility' },
          },
        ])
      )
      .mockResolvedValueOnce(aiText('Synthesized answer.'));

    const res = await runAgentLoop('q');

    expect(res.matches).toHaveLength(2);
    // scoped search uses a lower minScore (0.5) and a normalized meeting filter
    expect(mockRetrieve).toHaveBeenCalledWith('convertibility', 5, 0.5, {
      meetingId: 'NT50808.txt',
    });
  });

  it('handles several tool calls issued in a single turn', async () => {
    mockRetrieveAndRerank.mockResolvedValue([match('x')]);
    mockInvoke
      .mockResolvedValueOnce(
        aiToolCall([
          { name: 'search_minutes', args: { query: 'a' }, id: 'c1' },
          { name: 'search_minutes', args: { query: 'b' }, id: 'c2' },
        ])
      )
      .mockResolvedValueOnce(aiText('combined'));

    const res = await runAgentLoop('q');

    expect(res.matches).toHaveLength(2);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('exhausts the tool-turn budget and forces a tool-free final answer', async () => {
    // MAX_TOOL_TURNS = 4: four tool-calling turns, then a forced final turn.
    for (let i = 0; i < 4; i++) {
      mockInvoke.mockResolvedValueOnce(
        aiToolCall([{ name: 'search_minutes', args: { query: 'x' } }])
      );
    }
    mockInvoke.mockResolvedValueOnce(aiText('forced final answer'));

    const res = await runAgentLoop('q');

    expect(res.response).toBe('forced final answer');
    expect(mockInvoke).toHaveBeenCalledTimes(5);
    // The fifth (final) turn does not bind tools — tools are bound on turns 1-4 only.
    expect(mockBindTools).toHaveBeenCalledTimes(4);
  });

  it('recovers when a tool throws, continuing to a final answer', async () => {
    mockRetrieveAndRerank.mockRejectedValueOnce(new Error('pinecone down'));
    mockInvoke
      .mockResolvedValueOnce(aiToolCall([{ name: 'search_minutes', args: { query: 'x' } }]))
      .mockResolvedValueOnce(aiText('recovered'));

    const res = await runAgentLoop('q');

    expect(res.response).toBe('recovered');
    // The failed tool contributes no matches (no artifact on the error message).
    expect(res.matches).toHaveLength(0);
  });

  it('falls back to a default string when the model returns empty content', async () => {
    mockInvoke
      .mockResolvedValueOnce(aiToolCall([{ name: 'search_minutes', args: { query: 'x' } }]))
      .mockResolvedValueOnce(aiText(''));

    const res = await runAgentLoop('q');

    expect(res.response).toBe('Unable to generate response.');
  });
});

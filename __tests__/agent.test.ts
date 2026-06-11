/**
 * Tests for the tool-calling research agent (lib/agent.ts).
 *
 * The two external boundaries are mocked: the OpenAI client (chat completions
 * + embeddings) and Pinecone (vector search). The real agent loop and the real
 * tool executor (lib/tools.ts) run against those mocks, so no API keys or
 * network calls are involved. We drive the loop by queuing the exact sequence
 * of completion responses the "model" should return.
 */

import type { PineconeMatch } from '@/types';

const mockCreate = jest.fn();
const mockGenerateEmbedding = jest.fn();
const mockQueryPinecone = jest.fn();

jest.mock('@/lib/openai', () => ({
  getOpenAIClient: () => ({ chat: { completions: { create: mockCreate } } }),
  generateEmbedding: (text: string) => mockGenerateEmbedding(text),
}));

jest.mock('@/lib/pinecone', () => ({
  queryPinecone: (...args: unknown[]) => mockQueryPinecone(...args),
}));

import { runAgentLoop } from '@/lib/agent';

// --- response builders (shape mirrors openai chat.completions.create) ---

function toolCallResponse(
  calls: { name: string; args: unknown; id?: string }[]
) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: calls.map((c, i) => ({
            id: c.id ?? `call_${i}`,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        },
      },
    ],
  };
}

function textResponse(content: string | null) {
  return { choices: [{ message: { role: 'assistant', content } }] };
}

function match(id: string, score = 0.9): PineconeMatch {
  return {
    id,
    score,
    metadata: {
      text: `excerpt ${id}`,
      meeting_id: 'NT50000.txt',
      date: '1971-08-15',
      meeting_type: 'Board Meeting',
      attendees: '[]',
      topics: '[]',
      decisions_summary: '',
      chunk_index: 0,
      total_chunks: 1,
    },
  };
}

describe('runAgentLoop', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockGenerateEmbedding.mockReset();
    mockQueryPinecone.mockReset();
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQueryPinecone.mockResolvedValue([match('a')]);
  });

  it('searches once, then synthesizes an answer', async () => {
    mockCreate
      .mockResolvedValueOnce(
        toolCallResponse([{ name: 'search_minutes', args: { query: 'inflation' } }])
      )
      .mockResolvedValueOnce(textResponse('Inflation rose sharply in 1971.'));

    const res = await runAgentLoop('What happened with inflation?');

    expect(res.response).toBe('Inflation rose sharply in 1971.');
    expect(res.matches).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockGenerateEmbedding).toHaveBeenCalledWith('inflation');
    // search_minutes uses default topK=5 and minScore=0.7, no filter
    expect(mockQueryPinecone).toHaveBeenCalledWith(expect.any(Array), 5, 0.7);
  });

  it('forces a tool call on the first turn, then allows free choice', async () => {
    mockCreate
      .mockResolvedValueOnce(
        toolCallResponse([{ name: 'search_minutes', args: { query: 'gold' } }])
      )
      .mockResolvedValueOnce(textResponse('done'));

    await runAgentLoop('q');

    expect(mockCreate.mock.calls[0][0].tool_choice).toBe('required');
    expect(mockCreate.mock.calls[1][0].tool_choice).toBe('auto');
  });

  it('feeds tool results back as tool-role messages', async () => {
    mockCreate
      .mockResolvedValueOnce(
        toolCallResponse([
          { name: 'search_minutes', args: { query: 'gold' }, id: 'call_0' },
        ])
      )
      .mockResolvedValueOnce(textResponse('done'));

    await runAgentLoop('q');

    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolMessage = secondCallMessages.find(
      (m: { role: string }) => m.role === 'tool'
    );
    expect(toolMessage).toBeDefined();
    expect(toolMessage.tool_call_id).toBe('call_0');
    // formatMatches surfaces the meeting_id so the model can drill in
    expect(toolMessage.content).toContain('NT50000.txt');
  });

  it('drills into a meeting with a scoped, filtered search', async () => {
    mockQueryPinecone
      .mockResolvedValueOnce([match('a')]) // search_minutes
      .mockResolvedValueOnce([match('b')]); // search_within_meeting

    mockCreate
      .mockResolvedValueOnce(
        toolCallResponse([{ name: 'search_minutes', args: { query: 'gold' } }])
      )
      .mockResolvedValueOnce(
        toolCallResponse([
          {
            name: 'search_within_meeting',
            args: { meeting_id: 'NT50000.txt', query: 'convertibility' },
          },
        ])
      )
      .mockResolvedValueOnce(textResponse('Synthesized answer.'));

    const res = await runAgentLoop('q');

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(res.matches).toHaveLength(2);
    // scoped search uses a lower minScore (0.5) and a meeting_id filter
    expect(mockQueryPinecone).toHaveBeenNthCalledWith(
      2,
      expect.any(Array),
      5,
      0.5,
      { meeting_id: { $eq: 'NT50000.txt' } }
    );
  });

  it('handles several tool calls issued in a single turn', async () => {
    mockQueryPinecone.mockResolvedValue([match('x')]);
    mockCreate
      .mockResolvedValueOnce(
        toolCallResponse([
          { name: 'search_minutes', args: { query: 'a' }, id: 'c1' },
          { name: 'search_minutes', args: { query: 'b' }, id: 'c2' },
        ])
      )
      .mockResolvedValueOnce(textResponse('combined'));

    const res = await runAgentLoop('q');

    const toolMessages = mockCreate.mock.calls[1][0].messages.filter(
      (m: { role: string }) => m.role === 'tool'
    );
    expect(toolMessages).toHaveLength(2);
    expect(res.matches).toHaveLength(2);
  });

  it('exhausts the step budget and forces a tool-free final answer', async () => {
    // MAX_STEPS = 4: queue 4 tool-call turns, then the forced final turn.
    for (let i = 0; i < 4; i++) {
      mockCreate.mockResolvedValueOnce(
        toolCallResponse([{ name: 'search_minutes', args: { query: 'x' } }])
      );
    }
    mockCreate.mockResolvedValueOnce(textResponse('forced final answer'));

    const res = await runAgentLoop('q');

    expect(res.response).toBe('forced final answer');
    expect(mockCreate).toHaveBeenCalledTimes(5);

    const fallbackCall = mockCreate.mock.calls[4][0];
    expect(fallbackCall.tools).toBeUndefined();
    const lastMessage = fallbackCall.messages[fallbackCall.messages.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.content).toContain('final answer');
  });

  it('tolerates malformed tool-call arguments without crashing', async () => {
    const badToolCall = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'c1',
                type: 'function',
                function: { name: 'search_minutes', arguments: '{not valid json' },
              },
            ],
          },
        },
      ],
    };
    mockCreate
      .mockResolvedValueOnce(badToolCall)
      .mockResolvedValueOnce(textResponse('recovered'));

    const res = await runAgentLoop('q');

    expect(res.response).toBe('recovered');
    // empty args -> executeTool short-circuits before embedding/search
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    expect(res.matches).toHaveLength(0);
  });

  it('falls back to a default string when the model returns empty content', async () => {
    mockCreate
      .mockResolvedValueOnce(
        toolCallResponse([{ name: 'search_minutes', args: { query: 'x' } }])
      )
      .mockResolvedValueOnce(textResponse(null));

    const res = await runAgentLoop('q');

    expect(res.response).toBe('Unable to generate response.');
  });
});

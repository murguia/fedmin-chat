/**
 * Tests for the date extractor (lib/date-filter.ts).
 *
 * The chat model is mocked, so these verify the wrapper's null-handling contract
 * (when does it return a range vs. null), not the LLM's date parsing itself —
 * that quality is verified by the live eval.
 */

const mockInvoke = jest.fn();
const mockWithStructuredOutput = jest.fn(() => ({ invoke: mockInvoke }));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: mockWithStructuredOutput,
  })),
}));

import { extractDateRange } from '@/lib/date-filter';

describe('extractDateRange', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('returns a range when the model reports a constraint', async () => {
    mockInvoke.mockResolvedValueOnce({
      hasConstraint: true,
      start: '1971-08-01',
      end: '1971-08-31',
    });

    const res = await extractDateRange('what happened in August 1971?');
    expect(res).toEqual({ start: '1971-08-01', end: '1971-08-31' });
  });

  it('returns null when there is no temporal constraint', async () => {
    mockInvoke.mockResolvedValueOnce({ hasConstraint: false, start: null, end: null });

    const res = await extractDateRange('what did Burns think about inflation?');
    expect(res).toBeNull();
  });

  it('returns null when the flag is set but dates are missing', async () => {
    mockInvoke.mockResolvedValueOnce({ hasConstraint: true, start: null, end: null });

    const res = await extractDateRange('at some point');
    expect(res).toBeNull();
  });
});

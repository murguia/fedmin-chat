/**
 * Tests for retrieveAndRerank's date-aware hybrid path (lib/retrieve.ts).
 *
 * External deps are mocked (embeddings, the vector store, the date extractor,
 * and the assist model), so these exercise the control flow: date filter is
 * applied on the postgres backend, the filtered-with-fallback retries unfiltered
 * when the date-scoped pool is thin, and the pinecone backend skips extraction.
 */

import type { PineconeMatch } from '@/types';

const mockGenerateEmbedding = jest.fn();
const mockVectorSearch = jest.fn();
const mockExtractDateRange = jest.fn();
const mockAssistInvoke = jest.fn();

jest.mock('@/lib/openai', () => ({
  generateEmbedding: (...a: unknown[]) => mockGenerateEmbedding(...a),
}));
jest.mock('@/lib/vector-search', () => ({
  vectorSearch: (...a: unknown[]) => mockVectorSearch(...a),
}));
jest.mock('@/lib/date-filter', () => ({
  extractDateRange: (...a: unknown[]) => mockExtractDateRange(...a),
}));
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({ invoke: mockAssistInvoke })),
}));

import { retrieveAndRerank } from '@/lib/retrieve';

function match(id: string): PineconeMatch {
  return {
    id,
    score: 0.9,
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

const RANGE = { start: '1971-01-01', end: '1971-12-31' };
const rich = ['a', 'b', 'c', 'd', 'e', 'f'].map(match);

let savedBackend: string | undefined;

describe('retrieveAndRerank date hybrid', () => {
  beforeEach(() => {
    savedBackend = process.env.VECTOR_BACKEND;
    mockGenerateEmbedding.mockReset().mockResolvedValue([0.1, 0.2, 0.3]);
    mockExtractDateRange.mockReset().mockResolvedValue(RANGE);
    mockVectorSearch.mockReset();
    // expand -> 3 phrasings; rerank (prompt contains "Candidates:") -> indices.
    mockAssistInvoke.mockReset().mockImplementation((messages: { content: unknown }[]) => {
      const last = messages[messages.length - 1];
      const content = typeof last.content === 'string' ? last.content : '';
      return Promise.resolve(
        content.includes('Candidates:')
          ? { content: '0,1,2,3,4' }
          : { content: 'rephrase one\nrephrase two\nrephrase three' }
      );
    });
  });

  afterEach(() => {
    process.env.VECTOR_BACKEND = savedBackend;
  });

  it('applies the date filter, and falls back to unfiltered when the pool is thin', async () => {
    process.env.VECTOR_BACKEND = 'postgres';
    // Filtered search returns a thin pool; unfiltered returns plenty.
    mockVectorSearch.mockImplementation((_e, _k, _m, filter) =>
      Promise.resolve(filter ? [match('only-one')] : rich)
    );

    const res = await retrieveAndRerank('decisions during 1971', 5, 0.7);

    // date filter was applied...
    expect(mockVectorSearch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { dateRange: RANGE }
    );
    // ...and the fallback retried unfiltered
    expect(mockVectorSearch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined
    );
    expect(res).toHaveLength(5);
  });

  it('does not fall back when the date-scoped pool is already sufficient', async () => {
    process.env.VECTOR_BACKEND = 'postgres';
    mockVectorSearch.mockResolvedValue(rich); // filtered pool is rich enough

    await retrieveAndRerank('decisions during 1971', 5, 0.7);

    // every search carried the filter; none was called unfiltered
    expect(mockVectorSearch).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined
    );
  });

  it('skips date extraction on the pinecone backend', async () => {
    process.env.VECTOR_BACKEND = 'pinecone';
    mockVectorSearch.mockResolvedValue(rich);

    await retrieveAndRerank('decisions during 1971', 5, 0.7);

    expect(mockExtractDateRange).not.toHaveBeenCalled();
    expect(mockVectorSearch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined
    );
  });
});

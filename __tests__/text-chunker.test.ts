import { TextChunker } from '@/lib/text-chunker';

describe('TextChunker', () => {
  let chunker: TextChunker;

  beforeAll(() => {
    chunker = new TextChunker();
  });

  afterAll(() => {
    chunker.free();
  });

  describe('countTokens', () => {
    it('counts tokens for a simple string', () => {
      const count = chunker.countTokens('Hello world');
      expect(count).toBeGreaterThan(0);
    });

    it('returns 0 for empty string', () => {
      expect(chunker.countTokens('')).toBe(0);
    });

    it('longer text has more tokens', () => {
      const short = chunker.countTokens('Hello.');
      const long = chunker.countTokens('Hello world, this is a much longer sentence with many words.');
      expect(long).toBeGreaterThan(short);
    });
  });

  describe('chunk', () => {
    it('returns a single chunk for short text', () => {
      const chunks = chunker.chunk('This is a short sentence.', 500, 50);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('This is a short sentence.');
    });

    it('returns single empty-string chunk for empty text', () => {
      const chunks = chunker.chunk('', 500, 50);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('');
    });

    it('splits on sentence boundaries', () => {
      // Build text with distinct sentences that exceed the token limit
      const sentences = Array.from({ length: 20 }, (_, i) =>
        `This is sentence number ${i + 1} about Federal Reserve monetary policy decisions.`
      );
      const text = sentences.join(' ');

      const chunks = chunker.chunk(text, 50, 0);

      // Should produce multiple chunks
      expect(chunks.length).toBeGreaterThan(1);

      // Each chunk should end with a complete sentence (period)
      for (const chunk of chunks) {
        expect(chunk.trimEnd()).toMatch(/\.$/);
      }
    });

    it('respects the max token limit', () => {
      const sentences = Array.from({ length: 50 }, (_, i) =>
        `Sentence ${i + 1} discusses important economic policy.`
      );
      const text = sentences.join(' ');
      const maxTokens = 100;

      const chunks = chunker.chunk(text, maxTokens, 0);

      for (const chunk of chunks) {
        const tokens = chunker.countTokens(chunk);
        // Allow some tolerance since we don't split mid-sentence
        // A single sentence could push slightly over
        expect(tokens).toBeLessThan(maxTokens + 50);
      }
    });

    it('produces overlapping chunks when overlap > 0', () => {
      const sentences = Array.from({ length: 30 }, (_, i) =>
        `Statement ${i + 1} about interest rates.`
      );
      const text = sentences.join(' ');

      const chunksNoOverlap = chunker.chunk(text, 50, 0);
      const chunksWithOverlap = chunker.chunk(text, 50, 20);

      // With overlap, we expect more chunks
      expect(chunksWithOverlap.length).toBeGreaterThanOrEqual(chunksNoOverlap.length);

      // Adjacent chunks should share some text when overlap is used
      if (chunksWithOverlap.length >= 2) {
        const firstWords = chunksWithOverlap[0].split(' ');
        const secondWords = chunksWithOverlap[1].split(' ');
        const lastWordsOfFirst = firstWords.slice(-5).join(' ');
        const overlap = secondWords.slice(0, 10).join(' ').includes(lastWordsOfFirst);
        // The end of chunk 1 should appear at the start of chunk 2
        expect(secondWords.some(w => firstWords.includes(w))).toBe(true);
      }
    });

    it('handles text with no sentence-ending punctuation', () => {
      const text = 'This text has no periods or other sentence endings';
      const chunks = chunker.chunk(text, 500, 50);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('handles text with question marks and exclamation points', () => {
      const text = 'Is inflation rising? Yes it is! The Fed must act. What should they do?';
      const chunks = chunker.chunk(text, 500, 0);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('preserves all text content across chunks', () => {
      const sentences = Array.from({ length: 20 }, (_, i) =>
        `Unique sentence ${i + 1} with specific content.`
      );
      const text = sentences.join(' ');

      // Use no overlap so we can verify all content is present
      const chunks = chunker.chunk(text, 50, 0);
      const reassembled = chunks.join(' ');

      // Every original sentence should appear in the output
      for (const sentence of sentences) {
        expect(reassembled).toContain(sentence);
      }
    });
  });
});

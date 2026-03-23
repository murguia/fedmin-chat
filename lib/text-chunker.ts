import { encoding_for_model } from 'tiktoken';

const DEFAULT_CHUNK_SIZE = 500; // tokens
const DEFAULT_CHUNK_OVERLAP = 50; // tokens

export class TextChunker {
  private encoder: ReturnType<typeof encoding_for_model>;

  constructor() {
    this.encoder = encoding_for_model('gpt-4');
  }

  countTokens(text: string): number {
    return this.encoder.encode(text).length;
  }

  chunk(
    text: string,
    maxTokens: number = DEFAULT_CHUNK_SIZE,
    overlap: number = DEFAULT_CHUNK_OVERLAP
  ): string[] {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.countTokens(sentence);

      if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));

        // Keep overlap
        const overlapSentences: string[] = [];
        let overlapTokens = 0;
        for (let i = currentChunk.length - 1; i >= 0 && overlapTokens < overlap; i--) {
          overlapSentences.unshift(currentChunk[i]);
          overlapTokens += this.countTokens(currentChunk[i]);
        }
        currentChunk = overlapSentences;
        currentTokens = overlapTokens;
      }

      currentChunk.push(sentence);
      currentTokens += sentenceTokens;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }

    return chunks;
  }

  free() {
    this.encoder.free();
  }
}

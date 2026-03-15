import { NextRequest, NextResponse } from 'next/server';
import { generateEmbedding, generateChatResponse } from '@/lib/openai';
import { queryPinecone } from '@/lib/pinecone';
import { rateLimit } from '@/lib/rate-limit';
import type { ChatRequest, ChatResponse, Citation } from '@/types';

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed, remaining } = rateLimit(ip);

    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        {
          status: 429,
          headers: { 'X-RateLimit-Remaining': remaining.toString() },
        }
      );
    }

    const body: ChatRequest = await request.json();
    const { query } = body;

    // Validate query
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    if (query.length < 1 || query.length > 1000) {
      return NextResponse.json(
        { error: 'Query must be between 1 and 1000 characters' },
        { status: 400 }
      );
    }

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Search Pinecone for relevant chunks
    const matches = await queryPinecone(queryEmbedding, 5, 0.7);

    if (matches.length === 0) {
      return NextResponse.json({
        response:
          "I couldn't find any relevant information in the Federal Reserve meeting minutes for your query. Try rephrasing your question or asking about specific events, dates, or policy decisions from 1967-1973.",
        citations: [],
      } satisfies ChatResponse);
    }

    // Build context from matches
    const context = matches
      .map((match, i) => {
        const { metadata } = match;
        return `[Meeting ${i + 1}: ${metadata.date}, ${metadata.meeting_type}]
${metadata.text}
---`;
      })
      .join('\n\n');

    // Generate LLM response
    const response = await generateChatResponse(query, context);

    // Build citations
    const citations: Citation[] = matches.map((match) => {
      const { metadata, score } = match;
      let attendees: string[] = [];
      try {
        attendees = JSON.parse(metadata.attendees || '[]');
      } catch {
        attendees = [];
      }

      return {
        meeting_id: metadata.meeting_id,
        date: metadata.date,
        meeting_type: metadata.meeting_type,
        attendees,
        relevance_score: score,
        text_excerpt:
          metadata.text.length > 300
            ? metadata.text.substring(0, 300) + '...'
            : metadata.text,
      };
    });

    return NextResponse.json({
      response,
      citations,
    } satisfies ChatResponse);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

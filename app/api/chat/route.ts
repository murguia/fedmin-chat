import { NextRequest, NextResponse } from 'next/server';
import { runAgentLoop } from '@/lib/agent';
import { rateLimit } from '@/lib/rate-limit';
import type { ChatRequest, ChatResponse, Citation, PineconeMatch } from '@/types';

const MAX_CITATIONS = 8;

// Collapse the matches retrieved across all of the agent's searches into a
// deduped, score-ranked citation list (same chunk can surface in several searches).
function buildCitations(matches: PineconeMatch[]): Citation[] {
  const byId = new Map<string, PineconeMatch>();
  for (const m of matches) {
    const existing = byId.get(m.id);
    if (!existing || m.score > existing.score) byId.set(m.id, m);
  }

  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CITATIONS)
    .map((match) => {
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
}

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

    // Run the tool-calling research agent: it plans and issues searches over the
    // minutes, then synthesizes a grounded answer from what it retrieved.
    const { response, matches } = await runAgentLoop(query);

    return NextResponse.json({
      response,
      citations: buildCitations(matches),
    } satisfies ChatResponse);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

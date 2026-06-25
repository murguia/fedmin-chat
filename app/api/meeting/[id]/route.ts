import { NextResponse } from 'next/server';
import { getMeeting } from '@/lib/meetings';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  // The reader reconstructs full meeting text from the Postgres backend.
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: 'The full-meeting reader requires the database backend.' },
      { status: 503 }
    );
  }

  try {
    const meeting = await getMeeting(params.id);
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }
    return NextResponse.json(meeting);
  } catch (error) {
    console.error('Meeting reader error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

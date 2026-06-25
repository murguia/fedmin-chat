import { getPool } from './db';

export interface MeetingDocument {
  meeting_id: string;
  date: string;
  meeting_type: string;
  attendees: string[];
  text: string;
}

/**
 * Stitch a meeting's ordered chunks back into clean prose. The chunker overlaps
 * consecutive chunks (~50 tokens — it prepends the tail of the previous chunk),
 * so naive concatenation would repeat text at every boundary. For each chunk we
 * drop the longest prefix that duplicates the running text's suffix.
 */
export function stitchChunks(texts: string[]): string {
  let result = texts[0] ?? '';
  for (let i = 1; i < texts.length; i++) {
    const cur = texts[i];
    const max = Math.min(result.length, cur.length, 800);
    let overlap = 0;
    for (let len = max; len >= 20; len--) {
      if (result.slice(result.length - len) === cur.slice(0, len)) {
        overlap = len;
        break;
      }
    }
    result += cur.slice(overlap);
  }
  return result;
}

function parseAttendees(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Reconstruct a single meeting's full text + metadata from its ordered chunks.
 * A plain ordered lookup — the access pattern that's trivial in SQL and awkward
 * against a pure vector store. Postgres backend only.
 */
export async function getMeeting(meetingId: string): Promise<MeetingDocument | null> {
  const { rows } = await getPool().query(
    `SELECT text, to_char(meeting_date, 'YYYY-MM-DD') AS date, meeting_type, attendees
     FROM chunks
     WHERE meeting_id = $1
     ORDER BY chunk_index`,
    [meetingId]
  );

  if (rows.length === 0) return null;

  return {
    meeting_id: meetingId,
    date: rows[0].date ?? '',
    meeting_type: rows[0].meeting_type ?? '',
    attendees: parseAttendees(rows[0].attendees),
    text: stitchChunks(rows.map((r) => r.text as string)),
  };
}

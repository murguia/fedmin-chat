/**
 * Tests for stitchChunks (lib/meetings.ts) — the overlap-dedup that reconstructs
 * a meeting's full text from its overlapping chunks.
 */

import { stitchChunks } from '@/lib/meetings';

describe('stitchChunks', () => {
  it('returns a single chunk unchanged', () => {
    expect(stitchChunks(['the only chunk'])).toBe('the only chunk');
  });

  it('returns empty string for no chunks', () => {
    expect(stitchChunks([])).toBe('');
  });

  it('dedupes the overlapping boundary between two chunks', () => {
    const a = 'The Board convened. Chairman Burns presided over the meeting.';
    const b = 'Chairman Burns presided over the meeting. Gold reserves were discussed.';

    const stitched = stitchChunks([a, b]);

    expect(stitched).toBe(
      'The Board convened. Chairman Burns presided over the meeting. Gold reserves were discussed.'
    );
    // the overlapping sentence appears exactly once
    expect(stitched.match(/Chairman Burns presided over the meeting\./g)).toHaveLength(1);
  });

  it('chains overlaps across three chunks', () => {
    // Overlaps exceed the 20-char floor, mirroring the chunker's ~50-token overlap.
    const a = 'The first matter concerned the discount rate adjustment.';
    const b = 'concerned the discount rate adjustment. The second matter was foreign exchange reserves.';
    const c = 'The second matter was foreign exchange reserves. Finally the meeting adjourned.';

    const stitched = stitchChunks([a, b, c]);

    expect(stitched).toBe(
      'The first matter concerned the discount rate adjustment. The second matter was foreign exchange reserves. Finally the meeting adjourned.'
    );
  });

  it('concatenates chunks with no overlap', () => {
    expect(stitchChunks(['abc', 'def'])).toBe('abcdef');
  });
});

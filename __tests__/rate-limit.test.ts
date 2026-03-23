/**
 * Tests for the rate limiter (lib/rate-limit.ts)
 *
 * The rate limiter uses module-level state (a Map), so we need to
 * isolate each test by re-importing the module fresh.
 */

function getFreshRateLimit() {
  jest.resetModules();
  return require('@/lib/rate-limit').rateLimit as typeof import('@/lib/rate-limit').rateLimit;
}

describe('rateLimit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows the first request', () => {
    const rateLimit = getFreshRateLimit();
    const result = rateLimit('1.2.3.4');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
  });

  it('allows up to 20 requests from the same IP', () => {
    const rateLimit = getFreshRateLimit();
    for (let i = 0; i < 20; i++) {
      const result = rateLimit('1.2.3.4');
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks the 21st request from the same IP', () => {
    const rateLimit = getFreshRateLimit();
    for (let i = 0; i < 20; i++) {
      rateLimit('1.2.3.4');
    }
    const result = rateLimit('1.2.3.4');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('tracks IPs independently', () => {
    const rateLimit = getFreshRateLimit();
    for (let i = 0; i < 20; i++) {
      rateLimit('1.2.3.4');
    }
    const blocked = rateLimit('1.2.3.4');
    expect(blocked.allowed).toBe(false);

    const different = rateLimit('5.6.7.8');
    expect(different.allowed).toBe(true);
    expect(different.remaining).toBe(19);
  });

  it('resets after the time window expires', () => {
    const rateLimit = getFreshRateLimit();
    for (let i = 0; i < 20; i++) {
      rateLimit('1.2.3.4');
    }
    expect(rateLimit('1.2.3.4').allowed).toBe(false);

    // Advance past the 1-minute window
    jest.advanceTimersByTime(61 * 1000);

    const result = rateLimit('1.2.3.4');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
  });

  it('returns correct remaining count as requests accumulate', () => {
    const rateLimit = getFreshRateLimit();
    expect(rateLimit('1.2.3.4').remaining).toBe(19);
    expect(rateLimit('1.2.3.4').remaining).toBe(18);
    expect(rateLimit('1.2.3.4').remaining).toBe(17);
  });

  it('remaining never goes below 0', () => {
    const rateLimit = getFreshRateLimit();
    for (let i = 0; i < 25; i++) {
      const result = rateLimit('1.2.3.4');
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    }
  });
});

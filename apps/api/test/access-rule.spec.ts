import { isAccessLive } from '../src/payments/access';

const START = new Date('2026-08-01T12:00:00.000Z');
const END = new Date('2026-09-01T12:00:00.000Z');

/**
 * The one rule both access authorities go through.
 *
 * Pinned directly rather than only through the two callers: comparing the
 * subscription's answer with the entitlement's cannot detect a change to the
 * boundary, because both move together. This is where that is caught.
 */
describe('the access rule', () => {
  it('is live between its ends', () => {
    expect(
      isAccessLive(
        { startsAt: START, endsAt: END, revokedAt: null },
        new Date('2026-08-15T00:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('starts INCLUSIVE — the first instant counts', () => {
    expect(isAccessLive({ startsAt: START, endsAt: END, revokedAt: null }, START)).toBe(true);
    expect(
      isAccessLive(
        { startsAt: START, endsAt: END, revokedAt: null },
        new Date(START.getTime() - 1),
      ),
    ).toBe(false);
  });

  it('ends EXCLUSIVE — a window ending at noon is over at noon', () => {
    // The distinction a comparison between the two authorities cannot see.
    expect(isAccessLive({ startsAt: START, endsAt: END, revokedAt: null }, END)).toBe(false);
    expect(
      isAccessLive({ startsAt: START, endsAt: END, revokedAt: null }, new Date(END.getTime() - 1)),
    ).toBe(true);
  });

  it('never lapses when there is no end — a perpetual purchase', () => {
    expect(
      isAccessLive(
        { startsAt: START, endsAt: null, revokedAt: null },
        new Date('2099-01-01T00:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('is dead once revoked, whatever the dates say', () => {
    expect(
      isAccessLive(
        { startsAt: START, endsAt: END, revokedAt: new Date('2026-08-10T00:00:00.000Z') },
        new Date('2026-08-15T00:00:00.000Z'),
      ),
    ).toBe(false);

    // Even a perpetual one.
    expect(
      isAccessLive(
        { startsAt: START, endsAt: null, revokedAt: START },
        new Date('2030-01-01T00:00:00.000Z'),
      ),
    ).toBe(false);
  });
});

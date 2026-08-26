import { isAccessLive } from '../src/payments/access';

const START = new Date('2026-08-01T12:00:00.000Z');
const END = new Date('2026-09-01T12:00:00.000Z');

/**
 * The one rule that decides access.
 *
 * Pinned directly rather than only through its caller: a test that compares the
 * service's answer with a window rebuilt beside it cannot detect a change to
 * the boundary, because both move together. This is where that is caught.
 */
describe('the access rule', () => {
  it('is live between its ends', () => {
    expect(
      isAccessLive({ startsAt: START, endsAt: END }, new Date('2026-08-15T00:00:00.000Z')),
    ).toBe(true);
  });

  it('starts INCLUSIVE — the first instant counts', () => {
    expect(isAccessLive({ startsAt: START, endsAt: END }, START)).toBe(true);
    expect(isAccessLive({ startsAt: START, endsAt: END }, new Date(START.getTime() - 1))).toBe(
      false,
    );
  });

  it('ends EXCLUSIVE — a window ending at noon is over at noon', () => {
    // The distinction a test comparing two callers cannot see.
    expect(isAccessLive({ startsAt: START, endsAt: END }, END)).toBe(false);
    expect(isAccessLive({ startsAt: START, endsAt: END }, new Date(END.getTime() - 1))).toBe(true);
  });
});

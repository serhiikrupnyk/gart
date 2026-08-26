/**
 * A window during which access is live.
 *
 * A subscription's window is longer than the period it paid for whenever
 * dunning grace is running — grace was not bought, so it is the subscription
 * that says how long access actually RUNS, and this is the one place the
 * comparison is written.
 */
export interface AccessWindow {
  startsAt: Date;
  /** Null means it never lapses. */
  endsAt: Date | null;
  /** Set when access was withdrawn before its end, e.g. by a refund. */
  revokedAt: Date | null;
}

/**
 * Is this window live at `now`?
 *
 * The single rule, called rather than reimplemented, so «active» cannot come
 * to mean two different things in two files.
 *
 * The end is exclusive: a window ending at noon is over at noon, not at noon
 * and one millisecond. The start is inclusive for the same reason in reverse.
 */
export function isAccessLive(window: AccessWindow, now: Date): boolean {
  if (window.revokedAt !== null) {
    return false;
  }

  if (window.startsAt.getTime() > now.getTime()) {
    return false;
  }

  return window.endsAt === null || window.endsAt.getTime() > now.getTime();
}

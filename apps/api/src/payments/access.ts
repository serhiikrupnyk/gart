/**
 * A window during which access is live, whatever granted it.
 *
 * Two things decide access in this system, and they decide different halves of
 * it: an Entitlement records what a PAYMENT BOUGHT, and a Subscription records
 * how long access actually RUNS — which during dunning grace is longer, because
 * grace was not bought. Both are windows, so both answer the question the same
 * way, through here.
 */
export interface AccessWindow {
  startsAt: Date;
  /** Null means it never lapses — a perpetual one-time purchase. */
  endsAt: Date | null;
  /** Set when access was withdrawn before its end, e.g. by a refund. */
  revokedAt: Date | null;
}

/**
 * Is this window live at `now`?
 *
 * The single rule. Both authorities call it rather than each writing the
 * comparison out, so they cannot drift into disagreeing about what «active»
 * means — which is the risk that comes with having two of them at all.
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

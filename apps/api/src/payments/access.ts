import type { SubscriptionModel } from '../generated/prisma/models.js';

/**
 * A window during which access is live.
 *
 * A subscription's window is longer than the period it paid for whenever
 * dunning grace is running — grace was not bought, so it is `accessUntil` and
 * not `currentPeriodEnd` that says how long access actually RUNS, and this is
 * the one place the comparison is written.
 */
export interface AccessWindow {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Is this window live at `now`?
 *
 * The single rule, called rather than reimplemented, so «active» cannot come to
 * mean two different things in two files — and pinned by its own spec, because
 * a test that compares two callers cannot detect a change that moves both.
 *
 * The end is exclusive: a window ending at noon is over at noon, not at noon
 * and one millisecond. The start is inclusive for the same reason in reverse.
 */
export function isAccessLive(window: AccessWindow, now: Date): boolean {
  if (window.startsAt.getTime() > now.getTime()) {
    return false;
  }

  return window.endsAt.getTime() > now.getTime();
}

/**
 * Whether a trainer's workspace is live right now.
 *
 * The ONE adapter from a subscription row to the rule above, so the lapse
 * guard, the client allowance and the subscription's own reporting can never
 * disagree about who is paid up. A trial is live by exactly the same test: it
 * has a start and an `accessUntil` like any other arrangement, which is why
 * lapsing out of a trial and lapsing out of a paid plan need no separate code.
 */
export function isSubscriptionLive(subscription: SubscriptionModel, now: Date): boolean {
  return isAccessLive(
    { startsAt: subscription.currentPeriodStart, endsAt: subscription.accessUntil },
    now,
  );
}

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { SUBSCRIBER_MONTHLY_LIMIT, TIMEZONE } from '@core/constants/pricing';
import type { Subscription } from '@core/types/subscription';

/**
 * A professional's subscription at `subscriptions/{uid}`. Admin-SDK-written
 * (`setSubscription` today, Cardcom later); the owner may read their own.
 *
 * A MISSING document means "not a subscriber" — the common case, and not an
 * error.
 */

/** 'YYYY-MM' in the pricing timezone — the key the monthly counter resets on. */
export function currentMonthKey(d: Date = new Date()): string {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  return s.slice(0, 7);
}

export type SubscriptionState = {
  subscription: Subscription | null;
  /** Only an ACTIVE subscription counts. The monthly counter renders for these
   *  and nobody else. */
  isSubscriber: boolean;
  /** Projects opened this calendar month. A stale `monthKey` means the month has
   *  rolled over and the server has not written since — that reads as 0, not as
   *  last month's total. */
  monthCount: number;
  monthlyLimit: number;
  /** First of next month, in the pricing timezone — when the counter resets. */
  resetsAt: Date;
};

export function deriveSubscriptionState(sub: Subscription | null): SubscriptionState {
  const isSubscriber = sub?.status === 'active';
  const thisMonth = currentMonthKey();
  const monthCount = sub?.monthKey === thisMonth ? (Number(sub?.monthCount) || 0) : 0;

  const now = new Date();
  const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    subscription: sub,
    isSubscriber,
    monthCount,
    monthlyLimit: SUBSCRIBER_MONTHLY_LIMIT,
    resetsAt,
  };
}

export function listenToSubscription(
  userId: string,
  callback: (state: SubscriptionState) => void,
): () => void {
  return onSnapshot(
    doc(db, `subscriptions/${userId}`),
    (snap) => callback(deriveSubscriptionState(snap.exists() ? ({ ...snap.data() } as Subscription) : null)),
    (err) => {
      // A denial here must not masquerade as "not subscribed" — that would
      // silently apply the 2-slot cap to a paying subscriber.
      console.error('[pricing] listenToSubscription failed:', err?.code, err);
      callback(deriveSubscriptionState(null));
    },
  );
}

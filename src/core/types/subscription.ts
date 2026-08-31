import type { ID, Timestamp } from './common';

/**
 * A professional's subscription, at `subscriptions/{uid}`. Written by the Admin
 * SDK only (Cardcom later; a fake `setSubscription` callable during slice 1).
 * `monthKey` + `monthCount` are the free-project counter that resets on the 1st
 * of each calendar month in Asia/Jerusalem.
 */
export type Subscription = {
  userId: ID;
  status: 'active' | 'canceled';
  plan: 'monthly' | 'annual';
  startedAt: Timestamp;
  renewsAt?: Timestamp;
  /** 'YYYY-MM' in Asia/Jerusalem; a rollover resets `monthCount`. */
  monthKey: string;
  /** Projects opened this calendar month (subscriber free-project counter). */
  monthCount: number;
};

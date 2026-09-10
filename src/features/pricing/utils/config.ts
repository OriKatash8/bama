import {
  DEFAULT_FEE_PERCENT, DEFAULT_MAX_OPEN_PROJECTS, DEFAULT_DISPUTE_WINDOW_DAYS,
  DEFAULT_AUTO_CLOSE_REMINDER_DAYS, DEFAULT_AUTO_CLOSE_FINAL_DAYS,
  DEFAULT_AUTO_CLOSE_DAYS, DEFAULT_PAYMENT_FAILURE_GRACE_DAYS,
  DEFAULT_MIN_FEE_AMOUNT,
} from '@core/constants/pricing';

/**
 * Shape of the runtime config document `config/pricing`, and the pure merge that
 * turns a raw document into usable values.
 *
 * Separate from configService so it can be unit-tested without Firestore, which
 * is the convention the rest of this feature follows (see utils/fee.ts).
 *
 * Mirrors the server's copy in functions/src/pricing.ts — the server ENFORCES
 * with its copy, this one only displays.
 */
export type PricingConfig = {
  /** Commission rate as a PERCENT (3), not a fraction. */
  feePercent: number;
  maxOpenProjects: number;
  disputeWindowDays: number;
  autoCloseReminderDays: number;
  autoCloseFinalDays: number;
  autoCloseDays: number;
  /** Reserved; nothing reads this in this build. */
  paymentFailureGraceDays: number;
  /** Floor under every commission, in whole shekels. DISPLAY ONLY here: it is what
   *  the pricing screen quotes to a professional who has not been hired yet. Once
   *  they are hired, the value that prices their fee is `minFeeApplied` on their own
   *  fee record, snapshotted at that moment — read that, never this. */
  minFeeAmount: number;
};

export const PRICING_CONFIG_DEFAULTS: PricingConfig = {
  feePercent: DEFAULT_FEE_PERCENT,
  maxOpenProjects: DEFAULT_MAX_OPEN_PROJECTS,
  disputeWindowDays: DEFAULT_DISPUTE_WINDOW_DAYS,
  autoCloseReminderDays: DEFAULT_AUTO_CLOSE_REMINDER_DAYS,
  autoCloseFinalDays: DEFAULT_AUTO_CLOSE_FINAL_DAYS,
  autoCloseDays: DEFAULT_AUTO_CLOSE_DAYS,
  paymentFailureGraceDays: DEFAULT_PAYMENT_FAILURE_GRACE_DAYS,
  minFeeAmount: DEFAULT_MIN_FEE_AMOUNT,
};

/**
 * Merge a raw document over the defaults, FIELD BY FIELD.
 *
 * Per-field, not all-or-nothing: one unusable key must not revert every other key
 * to its default, which would change the displayed commission rate as a side
 * effect of a typo in an unrelated field.
 */
export function resolvePricingConfig(raw: unknown): PricingConfig {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...PRICING_CONFIG_DEFAULTS };
  for (const key of Object.keys(PRICING_CONFIG_DEFAULTS) as (keyof PricingConfig)[]) {
    const v = data[key];
    // All strictly positive. A 0 would read as "no fee" or "no window".
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[key] = v;
  }
  return out;
}

/** The fraction a fee document stores (0.03) from the percent config holds (3). */
export function feeRateOf(config: PricingConfig): number {
  return config.feePercent / 100;
}

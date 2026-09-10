/**
 * Server mirror of src/core/constants/pricing.ts. The Cloud Functions ENFORCE
 * with these values; keep the two files in sync. See the spec at
 * docs/bama-pricing-model-decisions.md.
 */

/** Platform fee charged to the PROFESSIONAL on client-confirmed completion.
 *  Taken on EACH pro's own accepted amount, not on the project total.
 *
 *  FALLBACK ONLY. The live rate comes from `config/pricing.feePercent` via
 *  lifecycle/config.ts; this is what runs when that document is unreachable. */
export const PLATFORM_FEE_RATE = 0.03; // 3% of what each professional is paid

// ── Runtime config defaults (config/pricing) ───────────────────────────────
// Every rate, cap and grace period the product exposes. These are the values
// used when the config document is missing or a key in it is unusable; they are
// NOT read directly by business logic, which goes through readConfig().

/** Commission rate as a percent. Mirrors PLATFORM_FEE_RATE * 100. */
export const DEFAULT_FEE_PERCENT = 3;
/** Concurrent projects a professional may hold a slot on. */
export const DEFAULT_MAX_OPEN_PROJECTS = 2;
/** The professional's window to dispute a client-confirmed completion. */
export const DEFAULT_DISPUTE_WINDOW_DAYS = 4;
/** After the deadline -> first reminder. */
export const DEFAULT_AUTO_CLOSE_REMINDER_DAYS = 3;
/** After the reminder -> final prompt. */
export const DEFAULT_AUTO_CLOSE_FINAL_DAYS = 7;
/** After the deadline -> auto-close. */
export const DEFAULT_AUTO_CLOSE_DAYS = 14;
/** Reserved; nothing reads this in this build. */
export const DEFAULT_PAYMENT_FAILURE_GRACE_DAYS = 7;

/**
 * DEAD. Nothing reads this.
 *
 * It gated `payFee`, an in-app "settle my own fee" callable that no longer exists:
 * there is no payment rail in the app at all. Settlement happens off-platform and
 * an admin records it with `markFeePaid`. Kept only so a Cardcom integration has an
 * obvious place to start; delete it if that never arrives.
 */
export const PAYMENTS_ENABLED = false;


/** Completion / confirmation timeouts (days). */
export const AUTO_CONFIRM_DAYS = 7;
export const COMPLETION_REMINDER_DAYS = [3, 6];
export const END_DATE_PROMPT_GRACE_DAYS = 3;
export const ARCHIVE_UNCONFIRMED_DAYS = 45;
export const REVIEW_FORCE_PUBLISH_DAYS = 60;

/** Fallback project length for expectedEndDate when the deadline can't be parsed. */
export const DEFAULT_PROJECT_DURATION_DAYS = 30;

/**
 * Offer price bounds (₪), inclusive. A TYPO CATCHER, not a business limit.
 *
 * Production held offers of ₪554,545 and ₪10,000,000 against a median of ₪300
 * (p95 ₪2,000; the largest credible offer was ₪10,000). Nothing in the UI, the
 * security rules or hireProfessional rejected them, and an accepted ₪10M offer
 * would have carried a ₪300,000 platform fee.
 *
 * ₪50,000 is 5x the top credible offer and still admits the largest real bundle
 * on the platform (₪50,000). A genuine production above it gets a clear error and
 * one conversation with support; a typo that passes silently corrupts the fee
 * base, which is far worse.
 *
 * Non-integers are deliberately allowed — a live bundle is priced ₪1,799.9, and
 * computeFee already rounds.
 */
export const MIN_OFFER_PRICE = 1;
export const MAX_OFFER_PRICE = 50_000;

/**
 * Project statuses on which a professional may be hired.
 *
 * Matches firestore.rules' statusTransitionAllowed(), which makes 'completed' and
 * 'cancelled' terminal — so the callable and the rules agree by construction. A
 * hire onto a cancelled project re-occupies a slot that cancelProject had freed,
 * and it has already happened in production.
 */
export const HIREABLE_STATUSES = ['open', 'in_progress'] as const;
/** True when `price` is a real number inside the inclusive offer bounds. */
export function isOfferPriceValid(price: unknown): price is number {
  return typeof price === 'number'
    && Number.isFinite(price)
    && price >= MIN_OFFER_PRICE
    && price <= MAX_OFFER_PRICE;
}

/**
 * Does hiring this professional onto this project consume a NEW slot?
 *
 * No, when they already hold one here from an earlier role: `slotHolders` is a
 * set maintained with arrayUnion, so a second role adds nothing. A slot means
 * "one project this pro is engaged on", not "one role".
 *
 * This has to be consulted BEFORE the cap query, because that query counts
 * `slotHolders array-contains proId` WITHOUT excluding the project being hired
 * onto. A pro already holding a role here therefore counted themselves, and was
 * effectively capped at maxOpenProjects - 1 OTHER projects: at a cap of
 * 2, being on one other project made a second different-category offer fail with
 * `slot-cap-reached` even though the write would have changed nothing.
 *
 * Keyed on `slotHolders`, NOT `professionalIds`, deliberately. A pro LEAVES
 * slotHolders when the project completes or is cancelled but stays in
 * professionalIds forever; re-hiring them onto a later project genuinely does need
 * a slot again. Keying on professionalIds would hand every past collaborator a
 * free extra engagement. Settling a fee has never any effect on either array.
 */
export function hireConsumesNewSlot(
  slotHolders: readonly string[] | undefined,
  proId: string,
): boolean {
  return !(slotHolders ?? []).includes(proId);
}

/**
 * At the cap, given how many projects they hold a slot on.
 *
 * `cap` is passed in rather than read from the constant so the caller supplies
 * the CONFIG value — that is what keeps the limit runtime-tunable. The default
 * preserves the old signature for the existing unit tests.
 */
export function atSlotCap(slotProjectCount: number, cap: number = DEFAULT_MAX_OPEN_PROJECTS): boolean {
  return slotProjectCount >= cap;
}

/** True when a project in this status may still be hired on. */
export function canHireOnStatus(status: unknown): boolean {
  return typeof status === 'string' && (HIREABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Shape of the runtime config document `config/pricing`.
 *
 * The reader lives in lifecycle/config.ts, which needs Firestore. Everything
 * here is pure so it can be unit-tested without it.
 */
export type PricingConfig = {
  /** Commission rate as a PERCENT (3), not a fraction. `fees/{proId}.feeRate`
   *  stays a fraction (0.03) so existing documents need no migration — convert
   *  at the boundary with feeRateOf(). */
  feePercent: number;
  /** Concurrent projects on which a professional may hold a slot. */
  maxOpenProjects: number;
  /** The professional's window to dispute a client-confirmed completion. */
  disputeWindowDays: number;
  autoCloseReminderDays: number;
  autoCloseFinalDays: number;
  autoCloseDays: number;
  /** Reserved. Nothing reads this in this build. */
  paymentFailureGraceDays: number;
};

export const CONFIG_DEFAULTS: PricingConfig = {
  feePercent: DEFAULT_FEE_PERCENT,
  maxOpenProjects: DEFAULT_MAX_OPEN_PROJECTS,
  disputeWindowDays: DEFAULT_DISPUTE_WINDOW_DAYS,
  autoCloseReminderDays: DEFAULT_AUTO_CLOSE_REMINDER_DAYS,
  autoCloseFinalDays: DEFAULT_AUTO_CLOSE_FINAL_DAYS,
  autoCloseDays: DEFAULT_AUTO_CLOSE_DAYS,
  paymentFailureGraceDays: DEFAULT_PAYMENT_FAILURE_GRACE_DAYS,
};

/**
 * Merge a raw config document over the defaults, FIELD BY FIELD.
 *
 * Per-field rather than all-or-nothing on purpose: one bad key (a string typed
 * into the console, a negative, a NaN) must not silently revert every other key
 * to its default, which would change the commission rate as a side effect of a
 * typo in an unrelated field.
 */
export function resolveConfig(raw: unknown): PricingConfig {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...CONFIG_DEFAULTS };
  for (const key of Object.keys(CONFIG_DEFAULTS) as (keyof PricingConfig)[]) {
    const v = data[key];
    // All of these are strictly positive. A 0 would read as "no fee" or "no
    // window" — too consequential to arrive by typo.
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[key] = v;
  }
  return out;
}

/** The fraction a fee doc stores (0.03), from the percent the config holds (3). */
export function feeRateOf(config: PricingConfig): number {
  return config.feePercent / 100;
}

/** Is `now` still inside the dispute window that ended at `endsAtMs`? */
export function withinDisputeWindow(endsAtMs: number | undefined, now: number): boolean {
  return typeof endsAtMs === 'number' && Number.isFinite(endsAtMs) && now <= endsAtMs;
}

/** All scheduled jobs + the monthly-counter reset run in this zone, not UTC. */
export const TIMEZONE = 'Asia/Jerusalem';

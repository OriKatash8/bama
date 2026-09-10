/**
 * BAMA pricing & project-lifecycle FALLBACK defaults.
 *
 * These are no longer the source of truth. Every rate, cap and grace period now
 * lives in the runtime config document `config/pricing`, read through
 * `@features/pricing/services/configService`. What is here is what the app runs
 * on when that document is missing or unreachable — nothing more.
 *
 * Mirrored on the server in functions/src/pricing.ts — keep the two in sync.
 */

/** Platform fee charged to the PROFESSIONAL on client-confirmed completion.
 *  Taken on EACH pro's own accepted amount, not on the project total.
 *  FALLBACK ONLY — the live rate is `config/pricing.feePercent`. */
export const PLATFORM_FEE_RATE = 0.03; // 3% of what each professional is paid

// ── Runtime config defaults (config/pricing) ───────────────────────────────
// Mirrors functions/src/pricing.ts. Used only when the config doc is unreachable.

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
/** Floor under every commission, in whole shekels (Terms 12.4.1). FALLBACK ONLY —
 *  the live value is `config/pricing.minFeeAmount`, and the value that actually
 *  prices a fee is `minFeeApplied`, snapshotted onto the fee record at hire. */
export const DEFAULT_MIN_FEE_AMOUNT = 6;

/**
 * DEAD. Nothing reads this.
 *
 * It gated `payFee`, an in-app "settle my own fee" callable that no longer exists:
 * there is no payment rail in the app at all. Settlement happens off-platform and
 * an admin records it with `markFeePaid`. Mirrors the server copy in
 * functions/src/pricing.ts; delete both if Cardcom never arrives.
 */
export const PAYMENTS_ENABLED = false;

/** Completion / confirmation timeouts (days). */
export const AUTO_CONFIRM_DAYS = 7;            // pro requested, client silent → auto-confirm
export const COMPLETION_REMINDER_DAYS = [3, 6]; // reminders before auto-confirm
export const END_DATE_PROMPT_GRACE_DAYS = 3;   // days after expected end date → "did it finish?" prompt
export const ARCHIVE_UNCONFIRMED_DAYS = 45;    // nobody responds → archive unconfirmed (no fee, slot frees)
export const REVIEW_FORCE_PUBLISH_DAYS = 60;   // held review publishes even if never paid

/** Fallback project length used to derive expectedEndDate when the deadline
 *  can't be parsed into a date. No inline defaults elsewhere. */
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
 *
 * KEEP IN SYNC with functions/src/pricing.ts, which ENFORCES these; this copy
 * only drives the submission UI's error message. firestore.rules holds a THIRD
 * literal copy — rules files cannot import — so all three move together.
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

/** All scheduled jobs and the monthly-counter reset run in this zone, not UTC. */
export const TIMEZONE = 'Asia/Jerusalem';

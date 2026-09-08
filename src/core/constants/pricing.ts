/**
 * BAMA pricing & project-lifecycle config. Single source of truth for every
 * rate, cap, and grace period — per the spec (docs/bama-pricing-model-decisions.md),
 * these are NEVER hardcoded in business logic.
 *
 * Mirrored on the server in functions/src/pricing.ts — keep the two in sync.
 * The client uses these for display; the Cloud Functions enforce with their copy.
 */

/** Platform fee charged to the PROFESSIONAL on client-confirmed completion.
 *  Taken on EACH pro's own accepted amount, not on the project total. */
export const PLATFORM_FEE_RATE = 0.03; // 3% of what each professional is paid

/**
 * Real payments (Cardcom) are live. FALSE until Cardcom ships.
 *
 * While false, `payFee` lets the owning professional settle their own project's
 * fee directly — a fake payment, so the flow is testable before Cardcom exists.
 * When this flips to true, `payFee` MUST reject direct calls: settlement then
 * happens only via the Cardcom webhook or the admin-only `markFeePaid`.
 * The flag closes the hole on its own — do not rely on remembering.
 */
export const PAYMENTS_ENABLED = false;

/** Non-subscriber: max simultaneously slot-active projects before hiring is blocked. */
export const NON_SUBSCRIBER_SLOT_CAP = 2;

/** Subscriber: free projects per calendar month (NOT 120/yr on the annual plan). */
export const SUBSCRIBER_MONTHLY_LIMIT = 10;

/** Subscription launch pricing (₪). */
export const SUB_PRICE_MONTHLY = 80;
export const SUB_PRICE_ANNUAL = 800;

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

/**
 * BAMA pricing & project-lifecycle config. Single source of truth for every
 * rate, cap, and grace period — per the spec (docs/bama-pricing-model-decisions.md),
 * these are NEVER hardcoded in business logic.
 *
 * Mirrored on the server in functions/src/pricing.ts — keep the two in sync.
 * The client uses these for display; the Cloud Functions enforce with their copy.
 */

/** Platform fee charged to the PROFESSIONAL on client-confirmed completion. */
export const PLATFORM_FEE_RATE = 0.03; // 3% of project value

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
export const DEFAULT_PROJECT_DURATION_DAYS = 14;

/** All scheduled jobs and the monthly-counter reset run in this zone, not UTC. */
export const TIMEZONE = 'Asia/Jerusalem';

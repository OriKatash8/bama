/**
 * Server mirror of src/core/constants/pricing.ts. The Cloud Functions ENFORCE
 * with these values; keep the two files in sync. See the spec at
 * docs/bama-pricing-model-decisions.md.
 */

/** Platform fee charged to the PROFESSIONAL on client-confirmed completion. */
export const PLATFORM_FEE_RATE = 0.03; // 3% of project value

/** Non-subscriber: max simultaneously slot-active projects before hiring is blocked. */
export const NON_SUBSCRIBER_SLOT_CAP = 2;

/** Subscriber: free projects per calendar month. */
export const SUBSCRIBER_MONTHLY_LIMIT = 10;

/** Subscription launch pricing (₪). */
export const SUB_PRICE_MONTHLY = 80;
export const SUB_PRICE_ANNUAL = 800;

/** Completion / confirmation timeouts (days). */
export const AUTO_CONFIRM_DAYS = 7;
export const COMPLETION_REMINDER_DAYS = [3, 6];
export const END_DATE_PROMPT_GRACE_DAYS = 3;
export const ARCHIVE_UNCONFIRMED_DAYS = 45;
export const REVIEW_FORCE_PUBLISH_DAYS = 60;

/** Fallback project length for expectedEndDate when the deadline can't be parsed. */
export const DEFAULT_PROJECT_DURATION_DAYS = 30;

/** All scheduled jobs + the monthly-counter reset run in this zone, not UTC. */
export const TIMEZONE = 'Asia/Jerusalem';

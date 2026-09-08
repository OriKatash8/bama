/**
 * Server mirror of src/core/constants/pricing.ts. The Cloud Functions ENFORCE
 * with these values; keep the two files in sync. See the spec at
 * docs/bama-pricing-model-decisions.md.
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
 * effectively capped at NON_SUBSCRIBER_SLOT_CAP - 1 OTHER projects: at a cap of
 * 2, being on one other project made a second different-category offer fail with
 * `slot-cap-reached` even though the write would have changed nothing.
 *
 * Keyed on `slotHolders`, NOT `professionalIds`, deliberately. A pro who settled
 * their fee early LEAVES slotHolders but stays in professionalIds; re-hiring them
 * genuinely does need a slot again, and the fee branch in hire.ts already treats
 * that as a real re-hire. Keying on professionalIds would hand every settled pro
 * a free extra engagement.
 */
export function hireConsumesNewSlot(
  slotHolders: readonly string[] | undefined,
  proId: string,
): boolean {
  return !(slotHolders ?? []).includes(proId);
}

/** Non-subscriber: at the cap given the number of projects where they hold a slot. */
export function atSlotCap(slotProjectCount: number): boolean {
  return slotProjectCount >= NON_SUBSCRIBER_SLOT_CAP;
}

/** Subscriber: at the monthly free-project limit. */
export function atMonthlyLimit(monthCount: number): boolean {
  return monthCount >= SUBSCRIBER_MONTHLY_LIMIT;
}

/**
 * This month's counter off a subscription doc, resetting on a month rollover.
 * Shared by the pre-hire check and the post-hire increment so the two can never
 * read it differently.
 */
export function monthCountFor(
  sub: { monthKey?: unknown; monthCount?: unknown } | null | undefined,
  thisMonth: string,
): number {
  return sub?.monthKey === thisMonth ? (Number(sub?.monthCount) || 0) : 0;
}

/** True when a project in this status may still be hired on. */
export function canHireOnStatus(status: unknown): boolean {
  return typeof status === 'string' && (HIREABLE_STATUSES as readonly string[]).includes(status);
}

/** All scheduled jobs + the monthly-counter reset run in this zone, not UTC. */
export const TIMEZONE = 'Asia/Jerusalem';

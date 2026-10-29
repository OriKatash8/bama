/**
 * Every tunable of the rental-company sync, in one place.
 *
 * The scheduler's interval is here too, but note that onSchedule reads it at
 * DEPLOY time: changing it needs a redeploy of syncAllRentalCompanies.
 */

export const RENTALS_REGION = 'europe-west1';

/** How often every non-manual company is re-synced. */
export const SYNC_SCHEDULE = 'every 12 hours';
export const SYNC_TIMEZONE = 'Asia/Jerusalem';

/** WooCommerce Store API paging. 100 is the API's own maximum. */
export const WOO_PER_PAGE = 100;
/** A ceiling on pages per company, so a misbehaving store cannot loop the sync. */
export const WOO_MAX_PAGES = 50;
export const FETCH_TIMEOUT_MS = 20_000;
export const FETCH_RETRIES = 2;
export const FETCH_RETRY_BASE_MS = 1_000;

/** Images per item kept in Storage (each gets a thumbnail and a detail image). */
export const MAX_IMAGES_PER_ITEM = 2;
/** Grid thumbnail and detail image widths, in px. Both are WebP. */
export const THUMB_WIDTH = 400;
export const DETAIL_WIDTH = 1000;
export const WEBP_QUALITY = 78;
/** A source image larger than this is skipped rather than downloaded. */
export const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;
/** Parallel image downloads during one sync. */
export const IMAGE_CONCURRENCY = 4;

/** The item description: stripped short_description (else description), cut to this. */
export const DESCRIPTION_MAX_CHARS = 500;
export const NAME_MAX_CHARS = 200;

/** Firestore batch size for item writes. Under the 500-op limit with room to spare. */
export const WRITE_BATCH_SIZE = 400;

/** Appended to every outbound link to a company's site. */
export const UTM_PARAMS: Record<string, string> = { utm_source: 'bama' };

/** Click counting: per-user first-pass limit (per function instance). */
export const CLICK_LIMIT_PER_WINDOW = 30;
export const CLICK_WINDOW_MS = 60_000;

/**
 * A sync that would hide more than this share of a company's live items stops
 * with an error instead (a store answering empty during maintenance must not
 * wipe the catalogue). Only applies above MIN_ITEMS_FOR_REMOVAL_GUARD live items.
 * The admin's "Sync now" can override it with force.
 */
export const MAX_REMOVAL_FRACTION = 0.5;
export const MIN_ITEMS_FOR_REMOVAL_GUARD = 10;

/** The error text kept on a company doc is cut to this. */
export const SYNC_ERROR_MAX_CHARS = 500;

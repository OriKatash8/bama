/**
 * Free daily Firestore quotas (Spark/Blaze free allotment, per project per day). The admin
 * Usage screen draws its progress bars against these; edit here if Google changes them.
 * Google resets them at midnight Pacific time; the server reports that moment as an Israel
 * hour in `adminStats/usage.quota`.
 */
export const FIRESTORE_FREE_DAILY = {
  reads: 50_000,
  writes: 20_000,
  deletes: 20_000,
} as const;

/** Bar turns amber from this fraction of the quota, red at 100%. */
export const QUOTA_WARN_FRACTION = 0.8;

/** A snapshot older than this is flagged as stale (the schedule runs hourly). */
export const USAGE_STALE_AFTER_MS = 3 * 60 * 60 * 1000;

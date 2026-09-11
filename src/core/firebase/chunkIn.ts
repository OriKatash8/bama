/**
 * Splitting for Firestore `in` queries.
 *
 * Separate from firestore.ts, which imports the SDK, so this can be unit-tested
 * without it — the convention utils/fee.ts and pricing/utils/config.ts follow.
 *
 * The binding limit is NOT the `in` operator's own 30-value cap. Rules that
 * resolve a related document with `get()` — priceOffers and bundleOffers both do,
 * to check the owning project's clientId — are capped at 20 document-access calls
 * per query, and an `in` list over that is refused with `permission-denied`.
 * Measured against production: 20 ids ALLOW, 26 ids denied.
 *
 * 10 is deliberately well under, so a rule that grows to two lookups per document
 * does not silently put us back over.
 */
export const IN_CHUNK_SIZE = 10;

export function chunkIn<T>(values: readonly T[], size: number = IN_CHUNK_SIZE): T[][] {
  if (size < 1) throw new Error('chunkIn: size must be at least 1');
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

/**
 * Merge per-chunk results into one list, keyed by document id.
 *
 * Keyed rather than concatenated because a caller's `in` list is not guaranteed
 * to be free of duplicates, and a repeated id would otherwise render the same
 * offer twice.
 */
export function mergeById<T extends { id: string }>(buckets: readonly T[][]): T[] {
  const byId = new Map<string, T>();
  for (const bucket of buckets) for (const row of bucket) byId.set(row.id, row);
  return [...byId.values()];
}

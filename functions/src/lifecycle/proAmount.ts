/**
 * The pure core of `computeProAmount` — one professional's accepted value on one
 * project, given the documents rather than querying for them.
 *
 * Deliberately free of `firebase-admin` so it can be unit-tested directly. The
 * Firestore reads stay in `computeProAmount` (helpers.ts), which is a thin
 * wrapper around this. It is NOT duplicated on the client: the fee base has one
 * implementation, and this is it.
 */

export type AcceptedOffer = {
  /** The offer's own price. Used when it is not part of an accepted bundle. */
  price?: number;
  /** Set on every offer submitted as part of a bundle (usePriceOffer.ts:68-70). */
  bundleId?: string;
};

export type BundleSummary = {
  status?: string;
  bundlePrice?: number;
};

/**
 * A bundle is ONE discounted amount covering several slots, so its children keep
 * their own prices and summing them would over-charge. It is therefore counted
 * once, at `bundlePrice` — but ONLY when the bundle itself was accepted.
 *
 * The parent-status check is the fix for a real mispricing. `hire.ts:194-196`
 * rejects a professional's pending bundles when one of their INDIVIDUAL offers is
 * accepted, and that accepted child still carries its `bundleId`. Reading
 * `bundlePrice` off a rejected parent billed the professional for slots the
 * client never took — ₪800 where ₪500 was agreed, in production.
 *
 * Falling back to the child's own price is deliberate, and not the same as
 * skipping it: the offer WAS accepted individually, so it is genuinely owed.
 * Skipping would undercharge.
 */
export function sumProAmount(
  offers: readonly AcceptedOffer[],
  bundles: ReadonlyMap<string, BundleSummary | undefined>,
): number {
  const seenBundles = new Set<string>();
  let total = 0;
  for (const offer of offers) {
    if (offer.bundleId) {
      const bundle = bundles.get(offer.bundleId);
      if (bundle?.status === 'accepted') {
        // Counted once across all of this bundle's children.
        if (seenBundles.has(offer.bundleId)) continue;
        seenBundles.add(offer.bundleId);
        total += bundle.bundlePrice ?? 0;
      } else {
        total += offer.price ?? 0;
      }
    } else {
      total += offer.price ?? 0;
    }
  }
  return total;
}

/**
 * The two decisions behind the price-offer filter chips.
 *
 * The chips replaced a "Sort & Filter" button that opened a modal with draft
 * state, Apply and Clear. Four taps to sort by price, and the current sort
 * invisible until you opened the sheet again. The chips show the state and
 * change it in one tap — but they bring one hazard the modal did not have, and
 * `effectiveShowOnly` exists for it.
 */

/** `null` is the default: newest first. There is no separate 'date' member —
 *  date-descending IS the default order, so a chip for it would duplicate it. */
export type OfferSort = 'price_asc' | 'price_desc' | 'stars' | null;
export type ShowOnly = 'all' | 'bundle';

/**
 * What the Price chip does when tapped.
 *
 * Cheapest first on the way in, because that is what a client comparing quotes
 * wants to see; tapping the chip again flips it. Both directions already
 * existed in the modal, so folding them into one chip keeps the capability
 * instead of quietly dropping half of it.
 */
export function nextPriceSort(current: OfferSort): OfferSort {
  return current === 'price_asc' ? 'price_desc' : 'price_asc';
}

/**
 * The bundle filter that is actually in force.
 *
 * The "bundle only" chip is only rendered when bundles exist, so the filter has
 * to stop applying at the same moment — otherwise accepting the last bundle
 * leaves the list filtered to nothing by a chip that is no longer on screen,
 * and the client has no way to undo it.
 *
 * Derived rather than reset through an effect: state that cannot go stale beats
 * state that gets corrected a render later.
 */
export function effectiveShowOnly(showOnly: ShowOnly, hasBundles: boolean): ShowOnly {
  return hasBundles ? showOnly : 'all';
}

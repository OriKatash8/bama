/**
 * The categories a synced rental item may carry, as the server sees them.
 * Mirrors RENTAL_TAB_CATEGORIES in src/features/marketplace/data/categories.ts
 * (the client owns labels and icons; this file owns which ids an item may get).
 * Studios and Production are BAMA Market categories only: a category map or an
 * admin choice naming them is refused, so no rental item can land in them.
 */
export const BAMA_CATEGORIES = [
  'camera', 'lens', 'audio', 'lighting', 'drone', 'accessories', 'grip',
] as const;
export type BamaCategory = (typeof BAMA_CATEGORIES)[number];

/** Not shown to users: an item nobody has sorted yet. */
export const UNSORTED = 'unsorted';
/** Not shown to users, on purpose: not gear (e.g. a store's consumables). */
export const HIDDEN = 'hidden';

export type ItemCategory = BamaCategory | typeof UNSORTED | typeof HIDDEN;
/** What an admin may assign: a real category, or hidden. Never 'unsorted'. */
export type AssignableCategory = BamaCategory | typeof HIDDEN;

export function isBamaCategory(v: unknown): v is BamaCategory {
  return typeof v === 'string' && (BAMA_CATEGORIES as readonly string[]).includes(v);
}

export function isAssignableCategory(v: unknown): v is AssignableCategory {
  return v === HIDDEN || isBamaCategory(v);
}

/** Only these reach users. */
export function isShownCategory(c: string): boolean {
  return isBamaCategory(c);
}

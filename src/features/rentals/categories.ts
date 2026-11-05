/**
 * The categories a synced rental item can be given, with their label keys
 * (`marketplace.*`). Mirrors BAMA_CATEGORIES in functions/src/rentals/categories.ts,
 * which is what the server accepts.
 *
 * 'hidden' is assignable (not gear: e.g. a store's consumables) but never shown
 * to users; 'unsorted' is never assignable and never shown. Neither may appear
 * as a category tile or in the second-hand listing form. Studios and
 * Production are BAMA Market categories only, so they are not offered here.
 */
export const RENTAL_CATEGORIES = [
  { id: 'camera', labelKey: 'category_camera' },
  { id: 'lens', labelKey: 'category_lens' },
  { id: 'audio', labelKey: 'category_audio' },
  { id: 'lighting', labelKey: 'category_light' },
  { id: 'drone', labelKey: 'category_drone' },
  { id: 'accessories', labelKey: 'category_accessories' },
  { id: 'grip', labelKey: 'category_grip' },
] as const;

export type RentalCategoryId = (typeof RENTAL_CATEGORIES)[number]['id'];

export const HIDDEN = 'hidden';
export const UNSORTED = 'unsorted';

export function isRentalCategory(id: string | null | undefined): id is RentalCategoryId {
  return !!id && RENTAL_CATEGORIES.some((c) => c.id === id);
}

/** `marketplace.*` label key for a category id, or null for unsorted/hidden/unknown. */
export function categoryLabelKey(id: string | null | undefined): string | null {
  return RENTAL_CATEGORIES.find((c) => c.id === id)?.labelKey ?? null;
}

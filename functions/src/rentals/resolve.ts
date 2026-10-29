import { HIDDEN, UNSORTED, isAssignableCategory, isShownCategory, type BamaCategory, type ItemCategory } from './categories';

/** { [external category name]: BAMA category id or 'hidden' } — set per company by the admin. */
export type CategoryMap = Record<string, string>;

/**
 * An item's category, in this order:
 *   0. manualCategory — the admin's own choice, which survives every sync;
 *   1. categoryMap, from the item's FIRST external category that has a mapping;
 *   2. otherwise 'unsorted'. The keyword suggestion is NOT applied here: it only
 *      pre-selects the admin's choice in "Needs sorting", so a guess never
 *      reaches users without a person confirming it.
 */
export function resolveCategory(input: {
  manualCategory?: string | null;
  externalCategories: string[];
  categoryMap: CategoryMap | null | undefined;
}): ItemCategory {
  if (isAssignableCategory(input.manualCategory)) return input.manualCategory;
  const map = input.categoryMap ?? {};
  for (const ext of input.externalCategories) {
    const mapped = map[ext];
    if (isAssignableCategory(mapped)) return mapped;
  }
  return UNSORTED;
}

/** Whether users see an item: an active item of an active company in a real category. */
export function isVisible(input: {
  companyActive: boolean;
  companyRemoved: boolean;
  itemActive: boolean;
  category: string;
}): boolean {
  return input.companyActive && !input.companyRemoved && input.itemActive && isShownCategory(input.category);
}

export { HIDDEN, UNSORTED };
export type { BamaCategory };

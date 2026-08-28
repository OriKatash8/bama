import type { EquipmentItem } from '@core/types/user';

export type { EquipmentItem };

/** Fixed equipment category taxonomy, in display order ('other' always last). */
export const EQUIPMENT_CATEGORIES: { id: string; labelKey: string }[] = [
  { id: 'camera', labelKey: 'profile_sections.eq_cat_camera' },
  { id: 'lens', labelKey: 'profile_sections.eq_cat_lens' },
  { id: 'lighting', labelKey: 'profile_sections.eq_cat_lighting' },
  { id: 'audio', labelKey: 'profile_sections.eq_cat_audio' },
  { id: 'drone', labelKey: 'profile_sections.eq_cat_drone' },
  { id: 'grip', labelKey: 'profile_sections.eq_cat_grip' },
  { id: 'other', labelKey: 'profile_sections.eq_cat_other' },
];

const CATEGORY_IDS = EQUIPMENT_CATEGORIES.map((c) => c.id);

/** Unknown/absent categories fall back to 'other'. */
export function normalizeCategory(category?: string): string {
  return category && CATEGORY_IDS.includes(category) ? category : 'other';
}

export function equipmentCategoryLabelKey(id: string): string {
  return EQUIPMENT_CATEGORIES.find((c) => c.id === id)?.labelKey ?? 'profile_sections.eq_cat_other';
}

/** Normalize a raw stored equipment array (mixed strings + objects) to items. */
export function normalizeEquipment(raw: (string | EquipmentItem)[] | undefined | null): EquipmentItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e): EquipmentItem | null => {
      if (typeof e === 'string') {
        const name = e.trim();
        return name ? { name, category: 'other' } : null;
      }
      if (e && typeof e === 'object' && typeof e.name === 'string' && e.name.trim()) {
        return { name: e.name.trim(), category: normalizeCategory(e.category) };
      }
      return null;
    })
    .filter((e): e is EquipmentItem => e !== null);
}

/** Group items by category (taxonomy order, empties skipped), keeping each
 *  item's original index for edit/remove. */
export function groupEquipment(
  items: EquipmentItem[],
): { category: string; entries: { item: EquipmentItem; index: number }[] }[] {
  const byCat = new Map<string, { item: EquipmentItem; index: number }[]>();
  items.forEach((item, index) => {
    const cat = normalizeCategory(item.category);
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push({ item, index });
  });
  return CATEGORY_IDS.filter((id) => byCat.has(id)).map((id) => ({ category: id, entries: byCat.get(id)! }));
}

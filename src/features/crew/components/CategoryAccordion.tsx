import { useState } from 'react';
import { ROLE_CATEGORIES, getSpecializations, labelOf, categoryLabel } from '../data/categories';
import { roleIdForCategory } from '@features/noticeboard/matching';
import { useSettingsStore } from '@core/stores/settingsStore';
import { CategoryItem } from './CategoryItem';

type Props = {
  /** Slots held for one (category, capability) pair — from useCrewBuilder. */
  unitCount: (category: string, cap?: string) => number;
  onSelectSubcategory: (category: string, capability: string | undefined) => void;
  onRemoveSubcategory: (category: string, capability: string | undefined) => void;
};

export function CategoryAccordion({ unitCount, onSelectSubcategory, onRemoveSubcategory }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const lang: 'he' | 'en' = useSettingsStore((s) => s.language) === 'he' ? 'he' : 'en';

  function handleToggle(category: string) {
    setExpandedCategory((prev) => (prev === category ? null : category));
  }

  return (
    <>
      {ROLE_CATEGORIES.map((category) => (
        <CategoryItem
          key={category}
          category={category}
          label={categoryLabel(category, lang)}
          // Carry the id, not only the label: the id is what reaches
          // requiredCapability, and a localized label there would match nothing.
          subcategories={getSpecializations(roleIdForCategory(category)).map((sp) => ({
            id: sp.id,
            label: labelOf(sp, lang),
          }))}
          expanded={expandedCategory === category}
          onToggle={() => handleToggle(category)}
          unitCount={unitCount}
          onSelectSubcategory={(cap) => onSelectSubcategory(category, cap)}
          onRemoveSubcategory={(cap) => onRemoveSubcategory(category, cap)}
        />
      ))}
    </>
  );
}

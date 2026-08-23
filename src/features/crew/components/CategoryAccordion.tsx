import { useState } from 'react';
import { ROLE_CATEGORIES, getSpecializations, labelOf, categoryLabel } from '../data/categories';
import { roleIdForCategory } from '@features/noticeboard/matching';
import { useSettingsStore } from '@core/stores/settingsStore';
import { CategoryItem } from './CategoryItem';
import type { CrewRequestSlot } from '@core/types/project';

type Props = {
  slots: CrewRequestSlot[];
  onSelectSubcategory: (category: string, subcategory: string) => void;
  onRemoveSubcategory: (category: string, subcategory: string) => void;
};

export function CategoryAccordion({ slots, onSelectSubcategory, onRemoveSubcategory }: Props) {
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
          subcategories={getSpecializations(roleIdForCategory(category)).map((sp) => labelOf(sp, lang))}
          expanded={expandedCategory === category}
          onToggle={() => handleToggle(category)}
          slots={slots}
          onSelectSubcategory={(sub) => onSelectSubcategory(category, sub)}
          onRemoveSubcategory={(sub) => onRemoveSubcategory(category, sub)}
        />
      ))}
    </>
  );
}

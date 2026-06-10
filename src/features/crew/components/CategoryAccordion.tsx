import { useState } from 'react';
import { CREW_CATEGORIES } from '../data/categories';
import { CategoryItem } from './CategoryItem';
import type { CrewRequestSlot } from '@core/types/project';

type Props = {
  slots: CrewRequestSlot[];
  onSelectSubcategory: (category: string, subcategory: string) => void;
};

export function CategoryAccordion({ slots, onSelectSubcategory }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  function handleToggle(category: string) {
    setExpandedCategory((prev) => (prev === category ? null : category));
  }

  return (
    <>
      {Object.entries(CREW_CATEGORIES).map(([category, subcategories]) => (
        <CategoryItem
          key={category}
          category={category}
          subcategories={subcategories}
          expanded={expandedCategory === category}
          onToggle={() => handleToggle(category)}
          slots={slots}
          onSelectSubcategory={(sub) => onSelectSubcategory(category, sub)}
        />
      ))}
    </>
  );
}

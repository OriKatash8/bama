import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useTheme } from '@core/hooks/useTheme';
import { capabilityOf } from '../data/categories';
import { SubCategoryRow } from './SubCategoryRow';

/** A specialization row: the stable id used for matching, plus its display label. */
export type SubcategoryOption = { id: string; label: string };

type Props = {
  category: string;
  label: string;
  subcategories: SubcategoryOption[];
  expanded: boolean;
  onToggle: () => void;
  /** Slots held for one (category, capability) pair — from useCrewBuilder. */
  unitCount: (category: string, cap?: string) => number;
  onSelectSubcategory: (capability: string | undefined) => void;
  onRemoveSubcategory: (capability: string | undefined) => void;
};

export function CategoryItem({
  category,
  label,
  subcategories,
  expanded,
  onToggle,
  unitCount,
  onSelectSubcategory,
  onRemoveSubcategory,
}: Props) {
  const colors = useTheme();
  return (
    <View>
      <TouchableOpacity
        style={[styles.header, { backgroundColor: colors.cardAlt, borderBottomColor: colors.border }]}
        onPress={onToggle}
        activeOpacity={0.8}
      >
        <Text style={[styles.title, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded &&
        subcategories.map((sub) => {
          // Per (category, capability), not per category: matching on the category
          // alone made every subskill row under a role show the same number.
          const cap = capabilityOf(sub.id);
          return (
            <SubCategoryRow
              key={sub.id}
              subcategory={sub.label}
              quantity={unitCount(category, cap)}
              onPress={() => onSelectSubcategory(cap)}
              onRemove={() => onRemoveSubcategory(cap)}
            />
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 16, fontWeight: '600' },
  chevron: { fontSize: 11 },
});

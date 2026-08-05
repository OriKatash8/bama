import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import type { CrewRequestSlot } from '@core/types/project';
import { useTheme } from '@core/hooks/useTheme';
import { SubCategoryRow } from './SubCategoryRow';

type Props = {
  category: string;
  subcategories: string[];
  expanded: boolean;
  onToggle: () => void;
  slots: CrewRequestSlot[];
  onSelectSubcategory: (subcategory: string) => void;
  onRemoveSubcategory: (subcategory: string) => void;
};

export function CategoryItem({
  category,
  subcategories,
  expanded,
  onToggle,
  slots,
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
        <Text style={[styles.title, { color: colors.text }]}>{category}</Text>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded &&
        subcategories.map((sub) => {
          const slot = slots.find(
            (s) => s.category === category
          );
          return (
            <SubCategoryRow
              key={sub}
              subcategory={sub}
              quantity={slot?.quantity ?? 0}
              onPress={() => onSelectSubcategory(sub)}
              onRemove={() => onRemoveSubcategory(sub)}
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

import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import type { CrewRequestSlot } from '@core/types/project';
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
  return (
    <View>
      <TouchableOpacity style={styles.header} onPress={onToggle} activeOpacity={0.8}>
        <Text style={styles.title}>{category}</Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded &&
        subcategories.map((sub) => {
          const slot = slots.find(
            (s) => s.category === category && s.subcategory === sub
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
    borderBottomColor: '#ffffff18',
    backgroundColor: '#12122a',
  },
  title: { fontSize: 16, fontWeight: '600', color: '#e0e0e0' },
  chevron: { fontSize: 11, color: '#888' },
});

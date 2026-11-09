import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { ROLE_CATEGORIES, communityCategoryLabel } from '@features/crew/data/categories';

type Props = {
  selected: string[];
  onToggle: (category: string) => void;
  lang: 'he' | 'en';
  /** Selected-chip colour (the surface's accent). */
  accent: string;
  disabled?: boolean;
  testIDPrefix?: string;
};

/**
 * Multi-select category chips, one per role, in ROLE_CATEGORIES order. Shared by the
 * community request form and the owner's category editor. The caller owns the
 * "at least one" rule: it sees every tap and can refuse to drop the last.
 */
export function CategoryChips({ selected, onToggle, lang, accent, disabled, testIDPrefix = 'category-chip' }: Props) {
  const rtl = lang === 'he';
  return (
    <View style={[styles.wrap, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      {ROLE_CATEGORIES.map((cat) => {
        const on = selected.includes(cat);
        return (
          <TouchableOpacity
            key={cat}
            testID={`${testIDPrefix}-${cat}`}
            onPress={() => onToggle(cat)}
            disabled={disabled}
            activeOpacity={0.8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: !!disabled }}
            style={[
              styles.chip,
              { borderColor: accent },
              on && { backgroundColor: accent },
              disabled && { opacity: 0.6 },
            ]}
          >
            <AppText weight="semiBold" style={[styles.text, { color: on ? '#FFFFFF' : accent }]}>
              {communityCategoryLabel(cat, lang)}
            </AppText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  text: { fontSize: 13 },
});

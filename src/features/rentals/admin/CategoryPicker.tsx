import { Pressable, StyleSheet, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { AdminText, RADIUS, TYPE, useAdminPalette, useScopedT } from '@features/admin/ui';
import { HIDDEN, RENTAL_CATEGORIES } from '../categories';

/**
 * Chips for choosing an item's category: every BAMA category, then 'hidden'.
 * With `noneLabel`, a first chip for "no choice" (value null) — "not mapped" in
 * the category table. Wraps instead of a dropdown, so it works the same on web
 * and phones and every option is one tap away.
 */
export function CategoryPicker({
  value,
  onChange,
  noneLabel,
  suggested,
  testIDPrefix,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  noneLabel?: string;
  /** Marks the keyword suggestion, so the admin sees where a pre-selection came from. */
  suggested?: string | null;
  testIDPrefix: string;
}) {
  const p = useAdminPalette();
  const { t: tm, rowDir } = useScopedT('marketplace');
  const { t } = useScopedT('admin_rental_companies');

  const options: { id: string | null; label: string }[] = [
    ...(noneLabel ? [{ id: null, label: noneLabel }] : []),
    ...RENTAL_CATEGORIES.map((c) => ({ id: c.id as string, label: tm(c.labelKey) })),
    { id: HIDDEN, label: t('hidden_category') },
  ];

  return (
    <View style={[styles.wrap, { flexDirection: rowDir }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.id === value;
        const isSuggestion = !!suggested && o.id === suggested;
        return (
          <Pressable
            key={o.id ?? 'none'}
            testID={`${testIDPrefix}-${o.id ?? 'none'}`}
            onPress={() => onChange(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={isSuggestion ? `${o.label} (${t('suggested')})` : o.label}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: on ? (o.id === HIDDEN ? p.text2 : p.accent) : pressed ? p.borderStrong : p.surface3,
                borderColor: isSuggestion && !on ? p.accent : 'transparent',
              },
            ]}
          >
            <View style={[styles.inner, { flexDirection: rowDir }]}>
              {isSuggestion && <Star size={11} color={on ? p.onAccent : p.accent} fill={on ? p.onAccent : p.accent} />}
              <AdminText weight={on ? 'semiBold' : 'medium'} style={[TYPE.chip, { color: on ? p.onAccent : p.text2 }]}>
                {o.label}
              </AdminText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexWrap: 'wrap', gap: 6 },
  inner: { alignItems: 'center', gap: 4 },
  chip: { borderRadius: RADIUS.pill, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1.5 },
});

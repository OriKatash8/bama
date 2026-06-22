import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useTheme } from '@core/hooks/useTheme';

type Props = {
  subcategory: string;
  quantity: number;
  onPress: () => void;
  onRemove: () => void;
};

export function SubCategoryRow({ subcategory, quantity, onPress, onRemove }: Props) {
  const colors = useTheme();
  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.card, borderBottomColor: colors.borderMuted }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, { color: colors.textSec }]}>{subcategory}</Text>
      {quantity > 0 && (
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.removeBtn, { borderColor: colors.inputBorder }]}
            onPress={onRemove}
            hitSlop={8}
          >
            <Text style={[styles.removeBtnText, { color: colors.textMuted }]}>−</Text>
          </TouchableOpacity>
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={styles.badgeText}>{quantity}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  label: { fontSize: 15 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { fontSize: 16, lineHeight: 18 },
  badge: {
    borderRadius: 12,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

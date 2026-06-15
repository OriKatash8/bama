import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';

type Props = {
  subcategory: string;
  quantity: number;
  onPress: () => void;
  onRemove: () => void;
};

export function SubCategoryRow({ subcategory, quantity, onPress, onRemove }: Props) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.label}>{subcategory}</Text>
      {quantity > 0 && (
        <View style={styles.controls}>
          <TouchableOpacity style={styles.removeBtn} onPress={onRemove} hitSlop={8}>
            <Text style={styles.removeBtnText}>−</Text>
          </TouchableOpacity>
          <View style={styles.badge}>
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
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  label: { fontSize: 15, color: '#333' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#888',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { fontSize: 16, color: '#555', lineHeight: 18 },
  badge: {
    backgroundColor: '#111',
    borderRadius: 12,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

type Props = {
  totalCount: number;
  onNext: () => void;
};

export function CrewBasket({ totalCount, onNext }: Props) {
  const label =
    totalCount === 0
      ? 'No roles selected'
      : `${totalCount} role${totalCount === 1 ? '' : 's'} selected`;

  return (
    <View style={styles.container}>
      <Text style={styles.count}>{label}</Text>
      <TouchableOpacity
        style={[styles.button, totalCount === 0 && styles.disabled]}
        onPress={onNext}
        disabled={totalCount === 0}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Next</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  count: { fontSize: 14, color: '#555' },
  button: {
    backgroundColor: '#111',
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 8,
  },
  disabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});

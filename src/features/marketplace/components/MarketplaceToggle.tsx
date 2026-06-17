import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import type { MarketplaceListingType } from '../types';

type Props = {
  active: MarketplaceListingType;
  onChange: (type: MarketplaceListingType) => void;
};

export function MarketplaceToggle({ active, onChange }: Props) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.pill, active === 'secondhand' && styles.pillActive]}
        onPress={() => onChange('secondhand')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, active === 'secondhand' && styles.labelActive]}>2nd Hand</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pill, active === 'rental' && styles.pillActive]}
        onPress={() => onChange('rental')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, active === 'rental' && styles.labelActive]}>Equipment Rental</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  pill: {
    backgroundColor: '#2a2a3e',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  pillActive: { backgroundColor: '#cb6ce6' },
  label: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  labelActive: { color: '#fff' },
});

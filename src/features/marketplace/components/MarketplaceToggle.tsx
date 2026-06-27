import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import type { MarketplaceListingType } from '../types';
import { useTheme } from '@core/hooks/useTheme';

type Props = {
  active: MarketplaceListingType;
  onChange: (type: MarketplaceListingType) => void;
};

export function MarketplaceToggle({ active, onChange }: Props) {
  const colors = useTheme();

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.pill, { backgroundColor: colors.cardAlt }, active === 'secondhand' && styles.pillActive]}
        onPress={() => onChange('secondhand')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, { color: colors.textMuted }, active === 'secondhand' && styles.labelActive]}>BAMA Market</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pill, { backgroundColor: colors.cardAlt }, active === 'rental' && styles.pillActive]}
        onPress={() => onChange('rental')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, { color: colors.textMuted }, active === 'rental' && styles.labelActive]}>BAMA Rental</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  pill: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  pillActive: { backgroundColor: '#cb6ce6' },
  label: { fontSize: 14, fontWeight: '600' },
  labelActive: { color: '#fff' },
});

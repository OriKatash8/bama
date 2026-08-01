import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import type { MarketplaceListingType } from '../types';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

type Props = {
  active: MarketplaceListingType;
  onChange: (type: MarketplaceListingType) => void;
};

export function MarketplaceToggle({ active, onChange }: Props) {
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.pill, { backgroundColor: colors.cardAlt }, active === 'secondhand' && styles.pillActive]}
        onPress={() => onChange('secondhand')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, { color: colors.textMuted }, active === 'secondhand' && styles.labelActive]}>
          {'BAMA Market'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pill, { backgroundColor: colors.cardAlt }, active === 'rental' && styles.pillActive]}
        onPress={() => onChange('rental')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, { color: colors.textMuted }, active === 'rental' && styles.labelActive]}>
          {'BAMA Rental'}
        </Text>
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
  pillActive: { backgroundColor: '#004aad' },
  label: { fontSize: 14, fontWeight: '600' },
  labelActive: { color: '#fff' },
});

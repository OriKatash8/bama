import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import type { MarketplaceListingType } from '../types';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
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
  const font = useAppFont();

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.pill, active === 'secondhand' ? styles.pillActive : styles.pillInactive]}
        onPress={() => onChange('secondhand')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, active === 'secondhand' ? styles.labelActive : styles.labelInactive, { ...font.semiBold }]}>
          {'BAMA Market'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pill, active === 'rental' ? styles.pillActive : styles.pillInactive]}
        onPress={() => onChange('rental')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, active === 'rental' ? styles.labelActive : styles.labelInactive, { ...font.semiBold }]}>
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
  pillInactive: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#004aad' },
  label: { fontSize: 14, fontWeight: '600' },
  labelActive: { color: '#ffffff' },
  labelInactive: { color: '#004aad' },
});

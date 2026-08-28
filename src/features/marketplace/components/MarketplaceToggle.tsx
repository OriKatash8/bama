import { useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { AppText } from '@components/ui/AppText';
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

  // Pop the newly-selected tab so the choice feels lively.
  const marketScale = useRef(new Animated.Value(1)).current;
  const rentalScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const val = active === 'secondhand' ? marketScale : rentalScale;
    val.setValue(0.9);
    Animated.spring(val, { toValue: 1, useNativeDriver: true, friction: 4, tension: 120 }).start();
  }, [active, marketScale, rentalScale]);

  return (
    <View style={styles.row}>
      <Animated.View style={{ transform: [{ scale: marketScale }] }}>
        <TouchableOpacity
          style={[styles.pill, active === 'secondhand' ? styles.pillActive : styles.pillInactive]}
          onPress={() => onChange('secondhand')}
          activeOpacity={0.8}
        >
          <AppText weight="semiBold" style={[styles.label, active === 'secondhand' ? styles.labelActive : styles.labelInactive]}>
            {'BAMA Market'}
          </AppText>
        </TouchableOpacity>
      </Animated.View>
      <Animated.View style={{ transform: [{ scale: rentalScale }] }}>
        <TouchableOpacity
          style={[styles.pill, active === 'rental' ? styles.pillActive : styles.pillInactive]}
          onPress={() => onChange('rental')}
          activeOpacity={0.8}
        >
          <AppText weight="semiBold" style={[styles.label, active === 'rental' ? styles.labelActive : styles.labelInactive]}>
            {'BAMA Rental'}
          </AppText>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  pill: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  // The selected tab is enlarged so it clearly stands out.
  pillActive: { backgroundColor: '#004aad', paddingVertical: 11, paddingHorizontal: 26, borderRadius: 22 },
  pillInactive: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#004aad' },
  label: { fontSize: 14, fontWeight: '600' },
  labelActive: { color: '#ffffff', fontSize: 16 },
  labelInactive: { color: '#004aad' },
});

import { useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { AppText } from '@components/ui/AppText';
import type { MarketplaceListingType } from '../types';
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
    // One segmented control on the band: a translucent track, the selected
    // segment filled white. Same two labels, same order, same onChange.
    <View style={styles.row}>
      <View style={styles.slot}>
      <Animated.View style={{ transform: [{ scale: marketScale }] }}>
        <TouchableOpacity
          style={[styles.pill, active === 'secondhand' && styles.pillActive]}
          onPress={() => onChange('secondhand')}
          activeOpacity={0.8}
          // 34 + the track's 3 + 5 of slop = 44 on each side.
          hitSlop={{ top: 5, bottom: 5 }}
          accessibilityRole="button"
          accessibilityState={{ selected: active === 'secondhand' }}
        >
          <AppText weight="semiBold" style={[styles.label, active === 'secondhand' ? styles.labelActive : styles.labelInactive]}>
            {'BAMA Market'}
          </AppText>
        </TouchableOpacity>
      </Animated.View>
      </View>
      <View style={styles.slot}>
      <Animated.View style={{ transform: [{ scale: rentalScale }] }}>
        <TouchableOpacity
          style={[styles.pill, active === 'rental' && styles.pillActive]}
          onPress={() => onChange('rental')}
          activeOpacity={0.8}
          hitSlop={{ top: 5, bottom: 5 }}
          accessibilityRole="button"
          accessibilityState={{ selected: active === 'rental' }}
        >
          <AppText weight="semiBold" style={[styles.label, active === 'rental' ? styles.labelActive : styles.labelInactive]}>
            {'BAMA Rental'}
          </AppText>
        </TouchableOpacity>
      </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    padding: 3,
  },
  slot: { flex: 1 },
  pill: {
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  pillActive: { backgroundColor: '#FFFFFF' },
  label: { fontSize: 13.5, fontWeight: '600' },
  labelActive: { color: '#4C1D95' },
  labelInactive: { color: 'rgba(255,255,255,0.85)' },
});

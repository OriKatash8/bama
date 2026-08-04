import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';

const BAMA_LOGO = require('../../../../assets/images/bama-logo.png');
import { useSwitchMode } from '@features/auth/hooks/useSwitchMode';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ActiveMode } from '@core/types/user';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

function PersonIcon({ color = '#fff' }: { color?: string }) {
  return (
    <View style={personStyles.wrap}>
      <View style={[personStyles.head, { backgroundColor: color }]} />
      <View style={[personStyles.body, { backgroundColor: color }]} />
    </View>
  );
}

const personStyles = StyleSheet.create({
  wrap:  { width: 22, height: 22, alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  head:  { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  body:  { width: 16, height: 10, borderRadius: 4, backgroundColor: '#fff' },
});

const CARD_MODES: { mode: ActiveMode; key: string; color: string }[] = [
  { mode: 'client',       key: 'mode_picker.client',       color: '#004aad' },
  { mode: 'professional', key: 'mode_picker.professional', color: '#cb6ce6' },
];

export function ModePicker() {
  const { switchMode } = useSwitchMode();
  const [pressed, setPressed] = useState<ActiveMode | null>(null);
  const language = useSettingsStore((s) => s.language);
  const font = useAppFont();
  const t = makeT(language === 'he' ? he : en);

  return (
    <View style={styles.container}>
      <Image source={BAMA_LOGO} style={styles.logo} contentFit="contain" cachePolicy="memory-disk" />

      <View style={styles.buttons}>
        {CARD_MODES.map(({ mode, key, color }) => {
          const isPressed = pressed === mode;
          return (
            <TouchableOpacity
              key={mode}
              style={[
                styles.btn,
                Platform.OS === 'web'
                  ? ({ background: isPressed ? 'linear-gradient(to right, #004aad, #cb6ce6)' : '#ffffff' } as any)
                  : { backgroundColor: isPressed ? color : '#ffffff' },
              ]}
              onPress={() => switchMode(mode)}
              onPressIn={() => setPressed(mode)}
              onPressOut={() => setPressed(null)}
              activeOpacity={1}
            >
              <Text style={[styles.btnText, { fontFamily: font.bold, color: isPressed ? '#ffffff' : (mode === 'client' ? '#004aad' : '#cb6ce6') }]}>
                {t(key)}
              </Text>
              {mode === 'client'
                ? <PersonIcon color={isPressed ? '#ffffff' : '#004aad'} />
                : <Text style={[styles.btnIcon, { color: isPressed ? '#ffffff' : '#cb6ce6' }]}>✦</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  logo: {
    width: '80%',
    height: 120,
    resizeMode: 'contain',
    alignSelf: 'center',
    marginTop: -80,
  },
  buttons: {
    width: '100%',
    gap: 16,
  },
  btn: {
    borderRadius: 16,
    paddingVertical: 26,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  btnText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  btnIcon: {
    color: '#ffffff',
    fontSize: 22,
  },
});

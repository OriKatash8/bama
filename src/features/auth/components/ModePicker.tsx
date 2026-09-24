import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { Image } from 'expo-image';

const BAMA_LOGO = require('../../../../assets/images/bama-logo.png');
import { useSwitchMode } from '@features/auth/hooks/useSwitchMode';
import { useSettingsStore } from '@core/stores/settingsStore';
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

/**
 * Each mode wears its own colour. The professional blue is the tab bar's
 * exactly; the client violet is one step lighter than the tab bar's #6D28D9,
 * which carries better on a white card at this size than the darker tone does.
 * Both are named here because the web pressed-state gradient below has to use
 * the same two, and a literal in one place and not the other would drift.
 */
const CLIENT_VIOLET = '#7C3AED';
const PRO_BLUE = '#1D4ED8';

const CARD_MODES: { mode: ActiveMode; key: string; color: string }[] = [
  { mode: 'client',       key: 'mode_picker.client',       color: CLIENT_VIOLET },
  { mode: 'professional', key: 'mode_picker.professional', color: PRO_BLUE },
];

export function ModePicker() {
  const { switchMode } = useSwitchMode();
  const [pressed, setPressed] = useState<ActiveMode | null>(null);
  const language = useSettingsStore((s) => s.language);
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
                  ? ({ background: isPressed ? `linear-gradient(to right, ${CLIENT_VIOLET}, ${PRO_BLUE})` : '#ffffff' } as any)
                  : { backgroundColor: isPressed ? color : '#ffffff' },
              ]}
              onPress={() => switchMode(mode)}
              onPressIn={() => setPressed(mode)}
              onPressOut={() => setPressed(null)}
              activeOpacity={1}
            >
              <AppText weight="bold" style={[styles.btnText, { color: isPressed ? '#ffffff' : color }]}>
                {t(key)}
              </AppText>
              <View style={styles.iconRight}>
                {mode === 'client'
                  ? <PersonIcon color={isPressed ? '#ffffff' : color} />
                  : <Text style={[styles.btnIcon, { color: isPressed ? '#ffffff' : color }]}>✦</Text>}
              </View>
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
    paddingHorizontal: 24,
    paddingBottom: 0,
  },
  logo: {
    width: '80%',
    height: 120,
    resizeMode: 'contain',
    alignSelf: 'center',
    marginTop: -160,
    marginBottom: 48,
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
    justifyContent: 'center',
    gap: 14,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  btnIcon: {
    color: '#ffffff',
    fontSize: 28,
  },
  iconRight: {
    position: 'absolute',
    right: 28,
  },
});

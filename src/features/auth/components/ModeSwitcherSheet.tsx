import { useEffect, useRef } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { useRouter } from 'expo-router';
import { CheckCircle } from 'lucide-react-native';
import { useAuthStore } from '@core/stores/authStore';
import { useSwitchMode } from '@features/auth/hooks/useSwitchMode';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ActiveMode } from '@core/types/user';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    let str = typeof result === 'string' ? result : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{{${k}}}`, v);
      }
    }
    return str;
  };
}

type Props = {
  visible: boolean;
  onClose: () => void;
};

const MODES: ActiveMode[] = ['professional', 'client'];

// Slide-down from top-right: translateY from -20 to 0
const SLIDE_START = -20;

// Web-only CSS gradient text
const gradientTextStyle = Platform.OS === 'web' ? ({
  background: 'linear-gradient(to right, #cb6ce6, #004aad)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
} as object) : {};

export function ModeSwitcherSheet({ visible, onClose }: Props) {
  const activeMode = useAuthStore((s) => s.activeMode);
  const { switchMode } = useSwitchMode();
  const router = useRouter();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);

  const modeLabel = (mode: ActiveMode): string => {
    const map: Record<ActiveMode, string> = {
      professional: t('mode_switcher.professional'),
      client:       t('mode_switcher.client'),
    };
    return map[mode];
  };

  const opacity     = useRef(new Animated.Value(0)).current;
  const translateY  = useRef(new Animated.Value(SLIDE_START)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      opacity.setValue(0);
      translateY.setValue(SLIDE_START);
    }
  }, [visible]);

  function handleSelect(mode: ActiveMode) {
    if (mode !== activeMode) switchMode(mode);
    onClose();
    if (mode === 'client') router.push('/(client)/(tabs)/home');
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Invisible full-screen backdrop — tap anywhere to close */}
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

      {/* Compact floating card, anchored above the profile tab */}
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: '#ffffff', borderColor: colors.border },
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        {MODES.map((mode, index) => {
          const isActive = mode === activeMode;
          const isLast   = index === MODES.length - 1;

          // Native fallback: dark purple when active
          const nativeActiveColor = { color: '#8b5cf6' };
          const nativeInactiveColor = { color: colors.text };

          return (
            <View key={mode}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => handleSelect(mode)}
                activeOpacity={0.7}
                disabled={isActive}
              >
                <AppText
                  weight="bold"
                  style={[
                    styles.rowLabel,
                    Platform.OS === 'web'
                      ? gradientTextStyle
                      : (isActive ? nativeActiveColor : nativeInactiveColor),
                  ]}
                >
                  {modeLabel(mode)}
                </AppText>

                {isActive && (
                  <View style={styles.checkWrap}>
                    <CheckCircle size={20} color="#004aad" strokeWidth={2.5} />
                  </View>
                )}
              </TouchableOpacity>

              {!isLast && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
            </View>
          );
        })}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: 70,
    right: 16,
    width: 180,
    borderRadius: 24,
    borderTopRightRadius: 4,
    borderWidth: 1,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  checkWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminPalette, useAdminT } from '../i18n';
import { RADIUS, liftShadow } from '../theme';
import { AdminText } from './primitives';

const SHOW_MS = 2000;
const FADE_MS = 200;

/**
 * The dashboard's own dark pill at the bottom (approved / rejected / removed).
 * Screen-local on purpose: the app's global toast is a different shape and
 * stays as it is everywhere else.
 */
export function useAdminToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const show = useCallback((m: string) => {
    setMessage(m);
    setNonce((n) => n + 1);
  }, []);
  return { message, nonce, show };
}

export function AdminToast({ message, nonce }: { message: string | null; nonce: number }) {
  const p = useAdminPalette();
  const { rtl } = useAdminT();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  // Each show() bumps `nonce`; the toast is up until that nonce has been put away.
  const [hiddenNonce, setHiddenNonce] = useState(0);
  const visible = !!message && nonce !== hiddenNonce;
  const shown = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message || nonce === 0) return;
    shown.value = reduce ? 1 : withTiming(1, { duration: FADE_MS });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      shown.value = reduce ? 0 : withTiming(0, { duration: FADE_MS });
      timer.current = setTimeout(() => setHiddenNonce(nonce), reduce ? 0 : FADE_MS);
    }, SHOW_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [message, nonce, reduce, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 16 }],
  }));

  if (!visible) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: 20 + insets.bottom }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        testID="admin-toast"
        style={[styles.pill, { backgroundColor: p.toastBg }, liftShadow(p), style]}
      >
        <AdminText weight="medium" style={[styles.text, { color: p.toastText, writingDirection: rtl ? 'rtl' : 'ltr' }]}>
          {message}
        </AdminText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  pill: { borderRadius: RADIUS.pill, paddingVertical: 9, paddingHorizontal: 16, maxWidth: 520 },
  text: { fontSize: 13, textAlign: 'center' },
});

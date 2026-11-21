import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { AppText } from './AppText';
import { useSegments } from 'expo-router';
import { useUiStore, type Toast as ToastData } from '@core/stores/uiStore';
import { FLOATING_TAB_BAR_BOTTOM, TAB_BAR_CONTENT_HEIGHT } from '@core/navigation/floatingTabBar';

/** Where the toasts sit: 80 above the bottom everywhere, except on the admin pages. */
const DEFAULT_BOTTOM = 80;
/** The admin's floating tab bar occupies its own height + the 24 it floats above the edge. A toast at 80
 *  landed on top of it ("Saved" over the tabs), so the admin routes lift it clear. */
export const ADMIN_TOAST_BOTTOM = FLOATING_TAB_BAR_BOTTOM + TAB_BAR_CONTENT_HEIGHT + 12;

function ToastItem({ toast }: { toast: ToastData }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const dismiss = useUiStore((s) => s.dismissToast);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(3000),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => dismiss(toast.id));
  }, []);

  const bg = toast.type === 'error' ? '#e00' : toast.type === 'success' ? '#0a0' : '#333';

  return (
    <Animated.View style={[styles.toast, { backgroundColor: bg, opacity }]}>
      <AppText weight="medium" style={styles.text}>{toast.message}</AppText>
    </Animated.View>
  );
}

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts);
  const inAdmin = useSegments()[0] === 'admin';
  return (
    <View style={[styles.container, inAdmin && { bottom: ADMIN_TOAST_BOTTOM }]} pointerEvents="none" testID="toast-container">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', bottom: DEFAULT_BOTTOM, left: 16, right: 16, gap: 8 },
  toast: { borderRadius: 8, padding: 12 },
  text: { color: '#fff', fontSize: 14, fontWeight: '500' },
});

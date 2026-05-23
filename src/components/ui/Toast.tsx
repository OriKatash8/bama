import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useUiStore, type Toast as ToastData } from '@core/stores/uiStore';

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
      <Text style={styles.text}>{toast.message}</Text>
    </Animated.View>
  );
}

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <View style={styles.container} pointerEvents="none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', bottom: 80, left: 16, right: 16, gap: 8 },
  toast: { borderRadius: 8, padding: 12 },
  text: { color: '#fff', fontSize: 14, fontWeight: '500' },
});

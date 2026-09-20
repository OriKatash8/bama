import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { AppText } from '@components/ui/AppText';

/**
 * The three decision buttons on the review cards (client and professional).
 *
 * They share one row at `flex: 1`, so a label that does not fit wraps to a
 * second line rather than shrinking: `minHeight` plus the row's own `stretch`
 * keeps all three the same height whichever of them wrapped.
 */
export function ActionButton({
  label, variant, disabled, loading, onPress, testID,
}: {
  label: string;
  variant: 'primary' | 'danger' | 'outline';
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
  testID: string;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      // 38 tall + 3 either side = 44. The row's own gap keeps the three apart.
      hitSlop={{ top: 3, bottom: 3 }}
      style={({ pressed }) => [
        styles.btn,
        styles[variant],
        pressed && !off && styles[`${variant}Pressed`],
        off && styles.btnDisabled,
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={variant === 'primary' ? '#ffffff' : '#4C1D95'} />
        : <AppText weight="semiBold" numberOfLines={2} style={[styles.btnText, styles[`${variant}Text`]]}>{label}</AppText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 12.5, lineHeight: 16, textAlign: 'center' },
  primary: { backgroundColor: '#6D28D9' },
  primaryPressed: { backgroundColor: '#5B21B6' },
  primaryText: { color: '#FFFFFF' },
  danger: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0D5D7' },
  dangerPressed: { backgroundColor: '#FDF4F4' },
  dangerText: { color: '#B4232A' },
  outline: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDD7EC' },
  outlinePressed: { backgroundColor: '#F7F4FD' },
  outlineText: { color: '#4C1D95' },
});

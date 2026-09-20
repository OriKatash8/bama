import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { CLIENT_TAB_ACTIVE, useModeAccent } from '@core/navigation/floatingTabBar';

/** The two modes' button palettes. Only the destructive one is the same in
 *  both: red is what it means, not which app you are in. */
const PALETTE = {
  client: { pressed: '#5B21B6', deep: '#4C1D95', border: '#DDD7EC', outlinePressed: '#F7F4FD' },
  pro:    { pressed: '#1E40AF', deep: '#1E3A8A', border: '#D4DEF7', outlinePressed: '#F2F6FD' },
} as const;

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
  const { accent } = useModeAccent();
  const p = accent === CLIENT_TAB_ACTIVE ? PALETTE.client : PALETTE.pro;
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
        variant === 'primary' && { backgroundColor: pressed && !off ? p.pressed : accent },
        variant === 'outline' && { borderColor: p.border, backgroundColor: pressed && !off ? p.outlinePressed : '#FFFFFF' },
        variant === 'danger' && pressed && !off && styles.dangerPressed,
        off && styles.btnDisabled,
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={variant === 'primary' ? '#ffffff' : p.deep} />
        : (
          <AppText
            weight="semiBold"
            numberOfLines={2}
            style={[styles.btnText, styles[`${variant}Text`], variant === 'outline' && { color: p.deep }]}
          >
            {label}
          </AppText>
        )}
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
  // The mode's accent paints the primary and outlines the secondary; the
  // literals here are only what both modes share.
  primary: {},
  primaryText: { color: '#FFFFFF' },
  danger: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0D5D7' },
  dangerPressed: { backgroundColor: '#FDF4F4' },
  dangerText: { color: '#B4232A' },
  outline: { backgroundColor: '#FFFFFF', borderWidth: 1 },
  outlineText: {},
});

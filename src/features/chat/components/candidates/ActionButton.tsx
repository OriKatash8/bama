import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { AppText } from '@components/ui/AppText';

/** The three decision buttons on the review cards (client and professional). */
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
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      activeOpacity={0.8}
      style={[styles.btn, styles[variant], off && styles.btnDisabled]}
    >
      {loading
        ? <ActivityIndicator size="small" color={variant === 'primary' ? '#ffffff' : '#004aad'} />
        : <AppText weight="semiBold" numberOfLines={1} style={[styles.btnText, styles[`${variant}Text`]]}>{label}</AppText>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { flex: 1, minHeight: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 13 },
  primary: { backgroundColor: '#004aad' },
  primaryText: { color: '#ffffff' },
  danger: { borderWidth: 1, borderColor: '#d64545' },
  dangerText: { color: '#d64545' },
  outline: { borderWidth: 1, borderColor: '#004aad55' },
  outlineText: { color: '#004aad' },
});

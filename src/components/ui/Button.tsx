import { TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', disabled = false, style }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <AppText weight="semiBold" style={[styles.label, variant === 'secondary' && styles.labelSecondary]}>{label}</AppText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  primary: { backgroundColor: '#000' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#000' },
  disabled: { opacity: 0.4 },
  label: { fontSize: 16, fontWeight: '600', color: '#fff' },
  labelSecondary: { color: '#000' },
});

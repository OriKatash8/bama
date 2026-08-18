import { TouchableOpacity, StyleSheet, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from './AppText';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  gradientColors?: string[];
};

export function Button({ label, onPress, variant = 'primary', disabled = false, style, gradientColors }: ButtonProps) {
  const useGradient = !!gradientColors && Platform.OS !== 'web';
  return (
    <TouchableOpacity
      style={[styles.base, !useGradient && styles[variant], disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {useGradient && (
        <LinearGradient
          colors={gradientColors as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: 8 }]}
        />
      )}
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

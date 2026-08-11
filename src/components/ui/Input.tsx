import { View, TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { AppText } from './AppText';

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  labelStyle?: object;
};

export function Input({ label, error, style, labelStyle, ...props }: InputProps) {
  return (
    <View style={styles.container}>
      {label && <AppText weight="medium" style={[styles.label, labelStyle]}>{label}</AppText>}
      <TextInput
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor="#999"
        {...props}
      />
      {error && <AppText weight="regular" style={styles.error}>{error}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  label: { fontSize: 14, fontWeight: '500', color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, color: '#000' },
  inputError: { borderColor: '#e00' },
  error: { fontSize: 12, color: '#e00' },
});

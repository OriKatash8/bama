import { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { AppText } from './AppText';

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  labelStyle?: object;
};

export function Input({ label, error, style, labelStyle, secureTextEntry, ...props }: InputProps) {
  const isPassword = !!secureTextEntry;
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.container}>
      {label && <AppText weight="medium" style={[styles.label, labelStyle]}>{label}</AppText>}
      <View style={styles.inputWrap}>
        <TextInput
          style={[styles.input, isPassword && styles.inputWithIcon, error && styles.inputError, style]}
          placeholderTextColor="#999"
          secureTextEntry={isPassword && !visible}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            activeOpacity={0.7}
          >
            {visible
              ? <EyeOff size={20} color="#999" strokeWidth={1.8} />
              : <Eye size={20} color="#999" strokeWidth={1.8} />}
          </TouchableOpacity>
        )}
      </View>
      {error && <AppText weight="regular" style={styles.error}>{error}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  label: { fontSize: 14, fontWeight: '500', color: '#333' },
  inputWrap: { position: 'relative', justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, color: '#000' },
  inputWithIcon: { paddingRight: 44 },
  inputError: { borderColor: '#e00' },
  eyeBtn: { position: 'absolute', right: 8, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  error: { fontSize: 12, color: '#e00' },
});

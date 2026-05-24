import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { RoleSelector } from './RoleSelector';
import { useRegister } from '@features/auth/hooks/useRegister';
import { isValidEmail, isNonEmpty } from '@utils/validators';
import type { UserRole } from '@core/types/user';

export function RegisterForm() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('client');
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
  }>({});
  const { isLoading, register } = useRegister();
  const router = useRouter();

  function validate(): boolean {
    const errors: { fullName?: string; email?: string; password?: string } = {};
    if (!isNonEmpty(fullName)) errors.fullName = 'Full name is required.';
    if (!isValidEmail(email)) errors.email = 'Enter a valid email.';
    if (password.length < 6) errors.password = 'Password must be at least 6 characters.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    await register(fullName, email, password, role);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <Input
        label="Full Name"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
        error={fieldErrors.fullName}
      />
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        error={fieldErrors.email}
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        error={fieldErrors.password}
      />
      <View style={styles.roleRow}>
        <Text style={styles.roleLabel}>I am a</Text>
        <RoleSelector value={role} onChange={setRole} />
      </View>
      <Button label="Create Account" onPress={handleSubmit} disabled={isLoading} />
      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => router.push('/(auth)/')}>
          <Text style={styles.link}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#000', marginBottom: 8 },
  roleRow: { gap: 8 },
  roleLabel: { fontSize: 14, fontWeight: '500', color: '#333' },
  link: { fontSize: 14, color: '#000', fontWeight: '500', textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { fontSize: 14, color: '#666' },
});

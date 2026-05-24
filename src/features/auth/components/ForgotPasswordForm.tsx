import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { useForgotPassword } from '@features/auth/hooks/useForgotPassword';
import { isValidEmail } from '@utils/validators';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const { isLoading, sent, sendReset } = useForgotPassword();
  const router = useRouter();

  function validate(): boolean {
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email.');
      return false;
    }
    setEmailError(undefined);
    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;
    await sendReset(email);
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Check your inbox</Text>
        <Text style={styles.body}>We sent a password reset link to {email}.</Text>
        <TouchableOpacity onPress={() => router.replace('/(auth)/')}>
          <Text style={styles.link}>Back to login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset Password</Text>
      <Text style={styles.body}>Enter your email and we'll send you a reset link.</Text>
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        error={emailError}
      />
      <Button label="Send reset link" onPress={handleSubmit} disabled={isLoading} />
      <TouchableOpacity onPress={() => router.replace('/(auth)/')}>
        <Text style={styles.link}>Back to login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#000', marginBottom: 8 },
  body: { fontSize: 15, color: '#666', lineHeight: 22 },
  link: { fontSize: 14, color: '#000', fontWeight: '500', textDecorationLine: 'underline' },
});

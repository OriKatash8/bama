import { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { useForgotPassword } from '@features/auth/hooks/useForgotPassword';
import { useTheme } from '@core/hooks/useTheme';
import { isValidEmail } from '@utils/validators';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const { isLoading, sent, sendReset } = useForgotPassword();
  const router = useRouter();
  const colors = useTheme();

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
        <View style={[styles.titleWrap, { marginBottom: -60 }]}>
          <Image source={require('../../../../assets/images/bama-logo.png')} style={styles.appLogo} resizeMode="contain" />
        </View>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, Platform.OS === 'web' && ({ boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33' } as any)]}>
          <Text style={styles.title}>CHECK INBOX</Text>
          <Text style={[styles.body, { color: colors.textSec }]}>We sent a password reset link to {email}.</Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/')}>
            <Text style={[styles.link, { color: colors.text }]}>Back to login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.titleWrap, { marginBottom: -60 }]}>
        <Image source={require('../../../../assets/images/bama-logo.png')} style={styles.appLogo} resizeMode="contain" />
      </View>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, Platform.OS === 'web' && ({ boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33' } as any)]}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>RESET PASSWORD</Text>
        </View>
        <Input
          placeholder="Email"
          placeholderTextColor={colors.placeholder}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          error={emailError}
          style={{ borderColor: '#cb6ce6', color: colors.text }}
        />
        <Button
          label="Send reset link"
          onPress={handleSubmit}
          disabled={isLoading}
          style={Platform.OS === 'web' ? ({
            background: 'linear-gradient(to right, #004aad, #cb6ce6)',
          } as any) : { backgroundColor: '#004aad' }}
        />
        <View style={styles.footer}>
          <TouchableOpacity onPress={() => router.replace('/(auth)/')}>
            <Text style={[styles.link, { color: colors.text }]}>Back to login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16, justifyContent: 'center', paddingHorizontal: 40, marginTop: -100 },
  titleWrap: { alignItems: 'center', width: '100%' },
  card: {
    borderRadius: 20,
    padding: 24,
    gap: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  appLogo: { width: 1040, height: 520 },
  title: { fontSize: 28, fontWeight: '900', color: '#004aad', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22 },
  link: { fontSize: 14, fontWeight: '500', textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
});

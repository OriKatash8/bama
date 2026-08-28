import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { ProfileHeader } from '@features/profile/components/ProfileHeader';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { uploadFile } from '@core/firebase/storage';
import { updateDocument } from '@core/firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

export default function ClientOnboardingScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setClientOnboarded = useAuthStore((s) => s.setClientOnboarded);
  const { showToast } = useUiStore();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();

  const [name, setName] = useState(user?.displayName ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  const canContinue = name.trim().length > 0 && !saving;

  async function handleContinue() {
    if (!user || !canContinue) return;
    setSaving(true);
    try {
      let photoURL = user.photoURL;
      if (photoUri) {
        const blob = await fetch(photoUri).then((r) => r.blob());
        photoURL = await uploadFile(`users/${user.id}/avatar/${Date.now()}.jpg`, blob);
      }
      const trimmed = name.trim();
      await updateDocument(`users/${user.id}`, {
        displayName: trimmed,
        photoURL,
        clientOnboarded: true,
      });
      setUser({ ...user, displayName: trimmed, photoURL });
      setClientOnboarded(true);
      router.replace('/(client)/(tabs)/home');
    } catch {
      showToast(t('client_onboarding.save_failed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen style={styles.content} scrollable>
      <AppText weight="bold" style={[styles.title, { color: colors.primary, textAlign: 'center' }]}>
        {t('client_onboarding.title')}
      </AppText>
      <AppText weight="regular" style={[styles.subtitle, { color: colors.textSec, textAlign: 'center' }]}>
        {t('client_onboarding.subtitle')}
      </AppText>

      <ProfileHeader
        photoURL={photoUri ?? user?.photoURL ?? null}
        name={name}
        isEditing
        onPhotoPress={pickPhoto}
        onNameChange={setName}
        size={120}
      />

      <Text style={[styles.hint, { ...font.regular, color: colors.textMuted, textAlign: 'center' }]}>
        {t('client_onboarding.add_photo')}
      </Text>

      <TouchableOpacity onPress={handleContinue} activeOpacity={0.85} disabled={!canContinue} style={{ opacity: canContinue ? 1 : 0.5 }}>
        <LinearGradient
          colors={['#004aad', '#cb6ce6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.continueBtn}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <AppText weight="bold" style={styles.continueText}>{t('client_onboarding.continue')}</AppText>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingTop: 40, gap: 8 },
  title: { fontSize: 24, marginBottom: 2 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 8, paddingHorizontal: 8 },
  hint: { fontSize: 12, marginTop: 4, marginBottom: 24 },
  continueBtn: {
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: { color: '#ffffff', fontSize: 16 },
});

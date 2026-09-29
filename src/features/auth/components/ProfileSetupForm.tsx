import { useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';

import { Screen } from '@components/layout/Screen';
import { PressableScale } from '@components/ui/PressableScale';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { uploadFile } from '@core/firebase/storage';
import { updateDocument } from '@core/firebase/firestore';
import { normalizePhone } from '@features/auth/utils/phone';
import { savePhone } from '@features/auth/services/phoneService';
import type { User } from '@core/types/user';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { shrinkAvatar } from '@features/profile/utils/shrinkAvatar';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

/**
 * The client home page's look: a white page, near-black text, flat grey
 * fields, and one solid blue button (the brand blue).
 */
const C = {
  page: '#FFFFFF',
  text: '#16132B',
  textSec: '#5B5870',
  placeholder: '#8A8799',
  fieldFill: '#F6F5FA',
  fieldBorder: '#EAE8F0',
  blue: '#004aad',
  /** A different fill, not an opacity: a dimmed button reads as broken. */
  blueOff: '#A9BCD9',
  avatarBg: '#EEF3FA',
  error: '#E5484D',
} as const;

const AVATAR = 116;

/**
 * The name / picture (/ phone) page. Two routes show it:
 *   /(auth)/setup          a brand-new account, before mode select
 *   /(client)/onboarding   an older account entering client mode for the first time
 * `extraFields` go on the same users/{uid} write; `onDone` navigates on.
 */
export function ProfileSetupForm({
  extraFields,
  subtitleKey = 'client_onboarding.subtitle',
  onDone,
}: {
  extraFields?: Partial<User>;
  subtitleKey?: string;
  onDone: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setClientOnboarded = useAuthStore((s) => s.setClientOnboarded);
  // No number on file yet (an Apple / Google sign-up never saw the register
  // form): this page asks for it, instead of a separate phone screen first.
  // Unknown (null) does not ask — the phone gate catches it after onboarding.
  const needsPhone = useAuthStore((s) => s.hasPhone) === false;
  const setHasPhone = useAuthStore((s) => s.setHasPhone);
  const { showToast } = useUiStore();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const textAlign: 'right' | 'left' = rtl ? 'right' : 'left';
  const font = useAppFont();

  const [name, setName] = useState(user?.displayName ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);
  const [focused, setFocused] = useState<'name' | 'phone' | null>(null);

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  const phoneOk = !needsPhone || normalizePhone(phone) !== null;
  const canContinue = name.trim().length > 0 && phoneOk && !saving;

  async function handleContinue() {
    if (!user || !canContinue) return;
    const e164 = needsPhone ? normalizePhone(phone) : null;
    if (needsPhone && !e164) {
      setPhoneError(t('auth.err_phone_invalid'));
      return;
    }
    setSaving(true);
    try {
      // The private contact doc, never the public user doc — as the phone screen does.
      if (e164) {
        await savePhone(user.id, e164);
        setHasPhone(true);
      }
      let photoURL = user.photoURL;
      if (photoUri) {
        const blob = await fetch(await shrinkAvatar(photoUri)).then((r) => r.blob());
        photoURL = await uploadFile(`users/${user.id}/avatar/${Date.now()}.jpg`, blob);
      }
      const trimmed = name.trim();
      await updateDocument(`users/${user.id}`, {
        displayName: trimmed,
        photoURL,
        clientOnboarded: true,
        ...extraFields,
      });
      setUser({ ...user, displayName: trimmed, photoURL, ...extraFields });
      setClientOnboarded(true);
      onDone();
    } catch {
      showToast(t('client_onboarding.save_failed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  const photo = photoUri ?? user?.photoURL ?? null;
  const fieldStyle = (which: 'name' | 'phone', error?: boolean): StyleProp<TextStyle> => [
    styles.input,
    font.regular,
    { textAlign },
    focused === which && styles.inputFocused,
    error && styles.inputError,
  ];

  return (
    <Screen backgroundColor={C.page} keyboardShouldPersistTaps="handled" style={styles.content}>
      <View testID="setup-page" style={styles.page}>
        <Text style={[styles.title, font.bold, { textAlign }]}>{t('client_onboarding.title')}</Text>
        <Text style={[styles.subtitle, font.regular, { textAlign }]}>{t(subtitleKey)}</Text>

        <PressableScale
          testID="setup-photo"
          onPress={pickPhoto}
          activeScale={0.96}
          style={styles.avatarWrap}
          accessibilityRole="button"
          accessibilityLabel={t('client_onboarding.add_photo')}
        >
          <View style={styles.avatar}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Camera size={34} color={C.blue} strokeWidth={1.7} />
            )}
          </View>
          <View style={[styles.avatarBadge, rtl ? styles.avatarBadgeRtl : styles.avatarBadgeLtr]}>
            <Camera size={15} color="#FFFFFF" strokeWidth={2.2} />
          </View>
        </PressableScale>
        <Text style={[styles.hint, font.regular]}>{t('client_onboarding.add_photo')}</Text>

        <Text style={[styles.label, font.semiBold, { textAlign }]}>{t('client_onboarding.name_label')}</Text>
        <TextInput
          testID="setup-name"
          value={name}
          onChangeText={setName}
          placeholder={t('client_onboarding.name_placeholder')}
          placeholderTextColor={C.placeholder}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          onFocus={() => setFocused('name')}
          onBlur={() => setFocused(null)}
          style={fieldStyle('name')}
        />

        {needsPhone && (
          <>
            <Text style={[styles.label, font.semiBold, { textAlign }]}>{t('auth.phone')}</Text>
            <TextInput
              testID="setup-phone"
              value={phone}
              onChangeText={(v) => { setPhone(v); if (phoneError) setPhoneError(undefined); }}
              placeholder="050-000-0000"
              placeholderTextColor={C.placeholder}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              onFocus={() => setFocused('phone')}
              onBlur={() => setFocused(null)}
              style={fieldStyle('phone', !!phoneError)}
            />
            {phoneError ? <Text style={[styles.error, font.regular, { textAlign }]}>{phoneError}</Text> : null}
          </>
        )}

        <View style={styles.spacer} />

        <PressableScale
          testID="onboarding-continue"
          onPress={handleContinue}
          activeScale={0.98}
          disabled={!canContinue}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContinue }}
          style={[styles.cta, !canContinue && styles.ctaOff]}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={[styles.ctaText, font.bold]}>{t('client_onboarding.continue')}</Text>
          )}
        </PressableScale>
      </View>
    </Screen>
  );
}

// Heebo's own line is 1.47em: every lineHeight here stays at or above that, or
// iOS cuts the tops off the letters.
const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 },
  page: { flex: 1, backgroundColor: C.page },
  title: { fontSize: 26, lineHeight: 39, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 15, lineHeight: 23, color: C.textSec, marginTop: 4 },

  avatarWrap: { alignSelf: 'center', marginTop: 32 },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: C.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarBadge: {
    position: 'absolute',
    bottom: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.blue,
    borderWidth: 3,
    borderColor: C.page,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadgeLtr: { right: 2 },
  avatarBadgeRtl: { left: 2 },
  hint: { fontSize: 13, lineHeight: 20, color: C.textSec, textAlign: 'center', marginTop: 10, marginBottom: 12 },

  label: { fontSize: 15, lineHeight: 23, fontWeight: '600', color: C.text, marginTop: 16, marginBottom: 8 },
  // No lineHeight: on a single-line TextInput it fights RN's vertical centring.
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: C.fieldBorder,
    borderRadius: 14,
    backgroundColor: C.fieldFill,
    paddingHorizontal: 15,
    fontSize: 16,
    color: C.text,
  },
  inputFocused: { borderColor: C.blue, backgroundColor: C.page },
  inputError: { borderColor: C.error },
  error: { fontSize: 13, lineHeight: 20, color: C.error, marginTop: 6 },

  spacer: { flexGrow: 1, minHeight: 28 },
  cta: {
    height: 56,
    borderRadius: 16,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: { backgroundColor: C.blueOff },
  ctaText: { fontSize: 17, lineHeight: 25, fontWeight: '700', color: '#FFFFFF' },
});

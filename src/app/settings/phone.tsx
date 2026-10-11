import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Phone } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { Input } from '@components/ui/Input';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import { useModeAccent } from '@core/navigation/floatingTabBar';
import { savePhone, subscribePhone } from '@features/auth/services/phoneService';
import { formatPhoneForDisplay, normalizePhone } from '@features/auth/utils/phone';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/** White page, grey card, black text. */
const BLACK = '#000000';
const GREY = '#F2F2F5';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    let result: unknown = translations;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

/**
 * The user's phone number, from Settings: pre-filled with the current number,
 * with back. The number is optional (App Store 5.1.1(v)) — nothing sends anyone
 * here and nothing requires one.
 *
 * A number is validated with normalizePhone and saved through savePhone, to the
 * private `users/{uid}/private/contact` — never the public user doc. Saving an
 * empty field with no number on file just goes back. A saved number can be
 * changed but not cleared: firestore.rules forbids deleting the contact doc.
 */
export default function PhoneSettings() {
  const router = useRouter();
  const colors = useTheme();
  const font = useAppFont();
  const { accent } = useModeAccent();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const textAlign = rtl ? 'right' : ('left' as const);
  const userId = useAuthStore((s) => s.user?.id);
  const setHasPhone = useAuthStore((s) => s.setHasPhone);
  const showToast = useUiStore((s) => s.showToast);

  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  // Whether a number is on file. Kept live: it decides what an empty Save means.
  const [onFile, setOnFile] = useState(false);

  // Pre-fill with the current number, once — later snapshots must not overwrite
  // what the user is typing.
  useEffect(() => {
    if (!userId) return;
    let filled = false;
    return subscribePhone(userId, (phone) => {
      setOnFile(phone !== null);
      if (filled) return;
      filled = true;
      if (phone) setValue(formatPhoneForDisplay(phone));
    });
  }, [userId]);

  async function handleSave() {
    // Optional: with nothing on file, an empty field is simply nothing to save.
    if (!value.trim() && !onFile) {
      router.back();
      return;
    }
    const e164 = normalizePhone(value);
    if (!e164) {
      setError(t('auth.err_phone_invalid'));
      return;
    }
    if (!userId) return;
    setError(undefined);
    setSaving(true);
    try {
      await savePhone(userId, e164);
      // The setup form reads this; nothing else updates the store meanwhile.
      setHasPhone(true);
      showToast(t('phone_settings.saved'), 'success');
      router.back();
    } catch (err) {
      console.error('[phone] save failed:', err);
      showToast(t('phone_settings.error'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen style={styles.content} scrollable backgroundColor="#FFFFFF">
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { flexDirection: rowDir }]}>
        <TouchableOpacity
          testID="phone-back"
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityRole="button"
          hitSlop={10}
        >
          {rtl ? <ChevronRight size={22} color={BLACK} strokeWidth={2} /> : <ChevronLeft size={22} color={BLACK} strokeWidth={2} />}
        </TouchableOpacity>
        <AppText weight="bold" style={[styles.title, { color: BLACK }]}>{t('phone_settings.title')}</AppText>
      </View>

      <View testID="phone-card" style={styles.card}>
        <View style={[styles.explainRow, { flexDirection: rowDir }]}>
          <Phone size={18} color={BLACK} strokeWidth={2} />
          <AppText weight="regular" style={[styles.explain, { color: BLACK, textAlign }]}>
            {t('phone_settings.edit_explain')}
          </AppText>
        </View>

        <Input
          placeholder={t('auth.phone_optional')}
          placeholderTextColor={colors.placeholder}
          value={value}
          onChangeText={(v) => { setValue(v); setError(undefined); }}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          error={error}
          textAlign={textAlign}
          style={{ backgroundColor: '#FFFFFF', borderColor: '#DCDCE2', color: BLACK, ...font.regular, textAlign }}
        />
        <AppText testID="phone-email-hint" weight="regular" style={[styles.hint, { textAlign }]}>
          {t('auth.phone_email_fallback_hint')}
        </AppText>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: accent }, saving && styles.saveBtnBusy]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          {saving
            ? <ActivityIndicator color="#ffffff" />
            : <AppText weight="semiBold" style={styles.saveText}>{t('phone_settings.save')}</AppText>}
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  header: { alignItems: 'center', gap: 6, marginTop: 8 },
  title: { fontSize: 22 },
  card: { borderRadius: 16, padding: 16, gap: 14, backgroundColor: GREY },
  explainRow: { alignItems: 'flex-start', gap: 10 },
  explain: { flex: 1, fontSize: 14, lineHeight: 20 },
  hint: { fontSize: 13, lineHeight: 19, color: '#5B5870' },
  saveBtn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtnBusy: { opacity: 0.7 },
  saveText: { color: '#ffffff', fontSize: 16 },
});

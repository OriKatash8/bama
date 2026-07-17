import { useState } from 'react';
import { useSettingsStore, type Lang } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Image, Platform, Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  User, Camera, ChevronRight, Lock, Bell, LogOut, Globe, Sun,
} from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { useClientProfile } from '@features/profile/hooks/useClientProfile';
import { useLogout } from '@features/auth/hooks/useLogout';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type AppColors = ReturnType<typeof useTheme>;
type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    let str = typeof result === 'string' ? result : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{{${k}}}`, v);
      }
    }
    return str;
  };
}

// ── Accessibility bottom sheet ──────────────────────────────────────────────

function AccessibilitySheet({
  visible,
  onClose,
  lang,
  setLang,
  isDark,
  toggleTheme,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  isDark: boolean;
  toggleTheme: () => void;
  colors: AppColors;
}) {
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheet.wrapper}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        <View style={[sheet.container, { backgroundColor: colors.bg }]}>
          {/* drag handle */}
          <View style={[sheet.handle, { backgroundColor: colors.border }]} />

          {/* LANGUAGE */}
          <Text style={[sheet.sectionLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {t('accessibility.language_header')}
          </Text>
          <View style={[sheet.card, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
            <View style={sheet.row}>
              <Globe size={20} color={colors.textMuted} strokeWidth={1.5} />
              <Text style={[sheet.rowLabel, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                {t('accessibility.language')}
              </Text>
              <View style={[sheet.langToggle, { borderColor: colors.border }]}>
                <TouchableOpacity
                  style={[sheet.langBtn, lang === 'he' && { backgroundColor: colors.primary }]}
                  onPress={() => setLang('he')}
                  activeOpacity={0.8}
                >
                  <Text style={[sheet.langBtnText, { color: lang === 'he' ? '#fff' : colors.textMuted }]}>
                    עברית
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sheet.langBtn, lang === 'en' && { backgroundColor: colors.primary }]}
                  onPress={() => setLang('en')}
                  activeOpacity={0.8}
                >
                  <Text style={[sheet.langBtnText, { color: lang === 'en' ? '#fff' : colors.textMuted }]}>
                    English
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* APPEARANCE */}
          <Text style={[sheet.sectionLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {t('accessibility.appearance_header')}
          </Text>
          <View style={[sheet.card, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
            <View style={sheet.row}>
              <Sun size={20} color={colors.textMuted} strokeWidth={1.5} />
              <Text style={[sheet.rowLabel, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                {t('accessibility.theme')}
              </Text>
              <View style={[sheet.langToggle, { borderColor: colors.border }]}>
                <TouchableOpacity
                  style={[sheet.langBtn, !isDark && { backgroundColor: colors.primary }]}
                  onPress={() => { if (isDark) toggleTheme(); }}
                  activeOpacity={0.8}
                >
                  <Text style={[sheet.langBtnText, { color: !isDark ? '#fff' : colors.textMuted }]}>
                    {t('accessibility.light')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sheet.langBtn, isDark && { backgroundColor: colors.primary }]}
                  onPress={() => { if (!isDark) toggleTheme(); }}
                  activeOpacity={0.8}
                >
                  <Text style={[sheet.langBtnText, { color: isDark ? '#fff' : colors.textMuted }]}>
                    {t('accessibility.dark')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* CLOSE */}
          <TouchableOpacity
            style={[sheet.closeBtn, { borderColor: colors.primary }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={[sheet.closeBtnText, { color: colors.primary }]}>{t('accessibility.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────

export default function ClientProfileScreen() {
  const { user, isSaving, save } = useClientProfile();
  const { showToast } = useUiStore();
  const { isLoading: isSigningOut, logout } = useLogout();
  const isDark = useUiStore((s) => s.isDark);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const colors = useTheme();
  const lang = useSettingsStore((s) => s.language);
  const switchLanguage = useSettingsStore((s) => s.setLanguage);
  const t = makeT(lang === 'he' ? he : en);
  const rtl = lang === 'he';
  const font = useAppFont();
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);

  const gradientStyle = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  } as object) : {};

  async function handlePhotoPress() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      try {
        await save(user?.displayName ?? '', result.assets[0].uri);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : t('profile.failed_photo');
        showToast(msg, 'error');
      }
    }
  }

  return (
    <Screen scrollable style={styles.screenContent}>
      <View style={styles.content}>

        {/* ── AVATAR ── */}
        <Text style={[styles.pageTitle, { fontFamily: font.bold }, Platform.OS === 'web' && gradientStyle, Platform.OS !== 'web' && { color: colors.accent }]}>
          {t('profile.my_profile')}
        </Text>
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accent }]}>
                <User size={36} color="#fff" strokeWidth={1.5} />
              </View>
            )}
            <TouchableOpacity
              style={[styles.editOverlay, { backgroundColor: colors.primary }]}
              onPress={handlePhotoPress}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              <Camera size={12} color="#fff" strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.displayName, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
            {user?.displayName ?? ''}
          </Text>
          <Text style={[styles.email, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {user?.email ?? ''}
          </Text>
        </View>

        {/* ── ACCOUNT ── */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
          {t('profile.account')}
        </Text>
        <View style={[styles.card, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => Alert.alert(t('profile.coming_soon'), t('profile.personal_details_soon'))}
            activeOpacity={0.7}
          >
            <User size={20} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={[styles.rowLabel, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
              {t('profile.personal_details')}
            </Text>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.5} />
          </TouchableOpacity>
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => Alert.alert(t('profile.coming_soon'), t('profile.privacy_soon'))}
            activeOpacity={0.7}
          >
            <Lock size={20} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={[styles.rowLabel, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
              {t('profile.privacy_security')}
            </Text>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.5} />
          </TouchableOpacity>
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => Alert.alert(t('profile.coming_soon'), t('profile.notifications_soon'))}
            activeOpacity={0.7}
          >
            <Bell size={20} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={[styles.rowLabel, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
              {t('profile.notifications')}
            </Text>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.5} />
          </TouchableOpacity>
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => setAccessibilityOpen(true)}
            activeOpacity={0.7}
          >
            <Globe size={20} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={[styles.rowLabel, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
              {t('profile.accessibility')}
            </Text>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>

        {/* ── LOGOUT ── */}
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.primary }, isSigningOut && styles.disabled]}
          onPress={logout}
          disabled={isSigningOut}
          activeOpacity={0.8}
        >
          <LogOut size={18} color={colors.primary} strokeWidth={1.5} />
          <Text style={[styles.logoutText, { color: colors.primary, textAlign: rtl ? 'right' : 'left' }]}>
            {t('profile.log_out')}
          </Text>
        </TouchableOpacity>

        <View style={styles.bottomPad} />
      </View>

      <AccessibilitySheet
        visible={accessibilityOpen}
        onClose={() => setAccessibilityOpen(false)}
        lang={lang}
        setLang={switchLanguage}
        isDark={isDark}
        toggleTheme={toggleTheme}
        colors={colors}
      />
    </Screen>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 100 },
  content: { paddingHorizontal: 20, paddingTop: 32 },
  pageTitle: { fontSize: 36, fontWeight: '800', fontFamily: 'Montserrat-Regular', textAlign: 'center', textTransform: 'uppercase', marginBottom: 16 },

  avatarSection: { alignItems: 'center', marginBottom: 8 },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  editOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayName: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  email: { fontSize: 14 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginTop: 24,
    marginBottom: 8,
  },

  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cardRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  rowDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    height: 52,
    marginTop: 24,
  },
  logoutText: { fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  bottomPad: { height: 40 },
});

const sheet = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 0,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 8,
  },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
  row: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  langToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 3,
    gap: 3,
  },
  langBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langBtnText: { fontSize: 13, fontWeight: '600' },

  closeBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  closeBtnText: { fontSize: 16, fontWeight: '600' },
});

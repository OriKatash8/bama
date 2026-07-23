import { useState } from 'react';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Image, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  User, Camera, ChevronRight, Lock, Bell,
} from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { useClientProfile } from '@features/profile/hooks/useClientProfile';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

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

export default function ClientProfileScreen() {
  const { user, isSaving, save } = useClientProfile();
  const { showToast } = useUiStore();
  const colors = useTheme();
  const lang = useSettingsStore((s) => s.language);
  const t = makeT(lang === 'he' ? he : en);
  const rtl = lang === 'he';
  const font = useAppFont();

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
        </View>

        <View style={styles.bottomPad} />
      </View>
    </Screen>
  );
}

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

  bottomPad: { height: 40 },
});

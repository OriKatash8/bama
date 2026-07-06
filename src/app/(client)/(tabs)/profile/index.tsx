import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch, Alert, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  User, Camera, Sun, Moon, ChevronRight, Lock, Bell, LogOut,
} from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { useClientProfile } from '@features/profile/hooks/useClientProfile';
import { useLogout } from '@features/auth/hooks/useLogout';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';

type Lang = 'he' | 'en';

export default function ClientProfileScreen() {
  const { user, isSaving, save } = useClientProfile();
  const { showToast } = useUiStore();
  const { isLoading: isSigningOut, logout } = useLogout();
  const isDark = useUiStore((s) => s.isDark);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const colors = useTheme();
  const [lang, setLang] = useState<Lang>('en');

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
        const msg = e instanceof Error ? e.message : 'Failed to update photo';
        showToast(msg, 'error');
      }
    }
  }

  return (
    <Screen scrollable>
      <View style={styles.content}>

        {/* ── 1. AVATAR ── */}
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
          <Text style={[styles.displayName, { color: colors.text }]}>
            {user?.displayName ?? ''}
          </Text>
          <Text style={[styles.email, { color: colors.textMuted }]}>
            {user?.email ?? ''}
          </Text>
        </View>

        {/* ── 2. LANGUAGE ── */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>LANGUAGE</Text>
        <View style={[styles.langRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.langBtn, lang === 'he' && { backgroundColor: colors.primary }]}
            onPress={() => setLang('he')}
            activeOpacity={0.8}
          >
            <Text style={[styles.langBtnText, { color: lang === 'he' ? '#fff' : colors.textMuted }]}>
              עברית
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langBtn, lang === 'en' && { backgroundColor: colors.primary }]}
            onPress={() => setLang('en')}
            activeOpacity={0.8}
          >
            <Text style={[styles.langBtnText, { color: lang === 'en' ? '#fff' : colors.textMuted }]}>
              English
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── 3. APPEARANCE ── */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardRow}>
            {isDark
              ? <Moon size={20} color={colors.textMuted} strokeWidth={1.5} />
              : <Sun size={20} color={colors.textMuted} strokeWidth={1.5} />}
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {isDark ? 'Dark mode' : 'Light mode'}
            </Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* ── 4. ACCOUNT ── */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ACCOUNT</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => Alert.alert('Coming soon', 'Personal details editing is not available yet.')}
            activeOpacity={0.7}
          >
            <User size={20} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>Personal details</Text>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.5} />
          </TouchableOpacity>
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => Alert.alert('Coming soon', 'Privacy & Security settings are not available yet.')}
            activeOpacity={0.7}
          >
            <Lock size={20} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>Privacy & Security</Text>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.5} />
          </TouchableOpacity>
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => Alert.alert('Coming soon', 'Notification settings are not available yet.')}
            activeOpacity={0.7}
          >
            <Bell size={20} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>Notifications</Text>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>

        {/* ── 5. LOGOUT ── */}
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.primary }, isSigningOut && styles.disabled]}
          onPress={logout}
          disabled={isSigningOut}
          activeOpacity={0.8}
        >
          <LogOut size={18} color={colors.primary} strokeWidth={1.5} />
          <Text style={[styles.logoutText, { color: colors.primary }]}>Log out</Text>
        </TouchableOpacity>

        <View style={styles.bottomPad} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 32 },

  // Avatar
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

  // Section labels
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginTop: 24,
    marginBottom: 8,
  },

  // Language toggle
  langRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 4,
    gap: 4,
  },
  langBtn: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  langBtnText: { fontSize: 15, fontWeight: '600' },

  // Cards
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

  // Logout
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

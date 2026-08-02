import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';

const BAMA_LOGO = require('../../../assets/images/bama-logo.png');
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  ChevronRight,
  Globe,
  Info,
  LogOut,
  Moon,
  Settings,
  Shield,
  Sun,
  User,
  X,
} from 'lucide-react-native';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore, type Lang } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useLogout } from '@features/auth/hooks/useLogout';
import { uploadFile } from '@core/firebase/storage';
import { updateDocument } from '@core/firebase/firestore';
import { ModeSwitcherSheet } from '@features/auth/components/ModeSwitcherSheet';
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

function getGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return 'noticeboard.greeting_morning';
  if (hour >= 12 && hour < 18) return 'noticeboard.greeting_afternoon';
  if (hour >= 18 && hour < 22) return 'noticeboard.greeting_evening';
  return 'noticeboard.greeting_night';
}

export function AppHeader() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const activeMode = useAuthStore((s) => s.activeMode);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const isDark = useUiStore((s) => s.isDark);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const colors = useTheme();
  const font = useAppFont();
  const { logout } = useLogout();
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const [modeSheetVisible, setModeSheetVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const slideAnim = useRef(new Animated.Value(280)).current;

  useEffect(() => {
    if (settingsVisible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(280);
    }
  }, [settingsVisible]);

  const firstName = user?.displayName?.split(' ')[0] ?? '';
  const greeting = `${t(getGreetingKey())}, ${firstName}`;
  const modeIsClient = activeMode === 'client';
  const modeBadgeColor = modeIsClient ? '#004aad' : '#cb6ce6';
  const modeBadgeLabel = modeIsClient ? t('header.client_mode') : t('header.pro_mode');

  async function handleAvatarPress() {
    if (!user) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;

    setAvatarUploading(true);
    try {
      const blob = await fetch(result.assets[0].uri).then((r) => r.blob());
      const path = `users/${user.id}/avatar/${Date.now()}.jpg`;
      const photoURL = await uploadFile(path, blob);
      await updateDocument(`users/${user.id}`, { photoURL });
      setUser({ ...user, photoURL });
    } catch {
      Alert.alert('Upload failed', 'Could not update your photo. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  }

  return (
    <>
      {/* ── Top bar ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8, paddingBottom: 10 }]}>
        {/* LEFT — logo */}
        <Image source={BAMA_LOGO} style={styles.logo} contentFit="contain" cachePolicy="memory-disk" />

        {/* CENTER — greeting only */}
        <View style={styles.center}>
          <Text
            style={[styles.greeting, { color: colors.text, fontFamily: font.regular }]}
            numberOfLines={1}
          >
            {greeting}
          </Text>
        </View>

        {/* RIGHT — settings + mode badge */}
        <View style={styles.rightGroup}>
          <TouchableOpacity
            style={styles.gearBtn}
            onPress={() => setSettingsVisible(true)}
            activeOpacity={0.7}
          >
            <Settings size={22} color={colors.text} strokeWidth={1.5} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBadge, { backgroundColor: modeBadgeColor }]}
            onPress={() => setModeSheetVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.modeBadgeText, { fontFamily: font.semiBold }]}>
              {modeBadgeLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ModeSwitcherSheet visible={modeSheetVisible} onClose={() => setModeSheetVisible(false)} />

      {/* ── Settings panel ── */}
      <Modal
        visible={settingsVisible}
        transparent
        animationType="none"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setSettingsVisible(false)}
        />
        <Animated.View
          style={[
            styles.panel,
            { backgroundColor: isDark ? colors.card : '#ffffff', transform: [{ translateX: slideAnim }] },
          ]}
        >
          {/* Close row */}
          <View style={[styles.panelTopBar, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setSettingsVisible(false)} activeOpacity={0.7} style={styles.closeBtn}>
              <X size={20} color={colors.text} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>

          {/* User info — tappable avatar */}
          <View style={[styles.userSection, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.8} style={styles.avatarWrap}>
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                {user?.photoURL ? (
                  <Image source={{ uri: user.photoURL }} style={styles.avatarImg} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <User size={24} color="#fff" strokeWidth={1.5} />
                )}
                {avatarUploading && (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator size="small" color="#ffffff" />
                  </View>
                )}
              </View>
              {/* Camera badge */}
              <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
                <Camera size={10} color="#fff" strokeWidth={2} />
              </View>
            </TouchableOpacity>
            <Text
              style={[styles.userName, { color: colors.text, fontFamily: font.bold }]}
              numberOfLines={1}
            >
              {user?.displayName ?? ''}
            </Text>
            <Text
              style={[styles.userEmail, { color: colors.textMuted, fontFamily: font.regular }]}
              numberOfLines={1}
            >
              {user?.email ?? ''}
            </Text>
          </View>

          {/* Menu items */}
          <View style={styles.menuList}>
            {/* Language */}
            <View style={[styles.menuRow, { borderBottomColor: colors.border }]}>
              <Globe size={18} color={colors.textMuted} strokeWidth={1.5} />
              <Text style={[styles.menuLabel, { color: colors.text, fontFamily: font.regular }]}>
                {t('settings.language')}
              </Text>
              <View style={[styles.langToggle, { borderColor: colors.border }]}>
                {(['he', 'en'] as Lang[]).map((lang) => {
                  const active = language === lang;
                  return (
                    <TouchableOpacity
                      key={lang}
                      style={[styles.langBtn, active && styles.langBtnActive]}
                      onPress={() => setLanguage(lang)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.langBtnText, { color: active ? '#fff' : colors.textMuted, fontFamily: font.semiBold }]}>
                        {lang === 'he' ? 'עב' : 'EN'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Appearance */}
            <View style={[styles.menuRow, { borderBottomColor: colors.border }]}>
              {isDark
                ? <Moon size={18} color={colors.textMuted} strokeWidth={1.5} />
                : <Sun size={18} color={colors.textMuted} strokeWidth={1.5} />}
              <Text style={[styles.menuLabel, { color: colors.text, fontFamily: font.regular }]}>
                {t('settings.appearance')}
              </Text>
              <TouchableOpacity
                onPress={toggleTheme}
                activeOpacity={0.8}
                style={[styles.themeTrack, { backgroundColor: isDark ? '#004aad' : '#e0e0e0' }]}
              >
                <Animated.View style={[styles.themeThumb, { transform: [{ translateX: isDark ? 16 : 0 }] }]} />
              </TouchableOpacity>
            </View>

            {/* Information */}
            <TouchableOpacity
              style={[styles.menuRow, { borderBottomColor: colors.border }]}
              onPress={() => Alert.alert(t('settings.information'), 'Coming soon')}
              activeOpacity={0.7}
            >
              <Info size={18} color={colors.textMuted} strokeWidth={1.5} />
              <Text style={[styles.menuLabel, { color: colors.text, fontFamily: font.regular }]}>
                {t('settings.information')}
              </Text>
              <ChevronRight size={16} color={colors.textMuted} strokeWidth={1.5} />
            </TouchableOpacity>

            {/* Privacy */}
            <TouchableOpacity
              style={[styles.menuRow, { borderBottomColor: colors.border }]}
              onPress={() => Alert.alert(t('settings.privacy'), 'Coming soon')}
              activeOpacity={0.7}
            >
              <Shield size={18} color={colors.textMuted} strokeWidth={1.5} />
              <Text style={[styles.menuLabel, { color: colors.text, fontFamily: font.regular }]}>
                {t('settings.privacy')}
              </Text>
              <ChevronRight size={16} color={colors.textMuted} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>

          {/* Logout */}
          <View style={[styles.logoutSection, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={styles.logoutRow}
              onPress={() => { setSettingsVisible(false); logout(); }}
              activeOpacity={0.7}
            >
              <LogOut size={18} color="#ff4d6d" strokeWidth={1.5} />
              <Text style={[styles.logoutText, { fontFamily: font.semiBold }]}>
                {t('settings.logout')}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  logo: { width: 60, height: 22 },
  center: {
    flex: 1,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  greeting: { fontSize: 13, textAlign: 'center' },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modeBadgeText: { fontSize: 11, color: '#ffffff' },
  gearBtn: { padding: 4 },

  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  panelTopBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: { padding: 4 },

  userSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: { position: 'relative', marginBottom: 4 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 64, height: 64 },
  avatarOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  userEmail: { fontSize: 12, textAlign: 'center' },

  menuList: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuLabel: { flex: 1, fontSize: 14 },

  langToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 2,
    gap: 2,
  },
  langBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langBtnActive: { backgroundColor: '#004aad' },
  langBtnText: { fontSize: 12 },

  themeTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    padding: 2,
  },
  themeThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },

  logoutSection: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  logoutText: { fontSize: 14, color: '#ff4d6d' },
});

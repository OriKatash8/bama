import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator, Modal, Switch, Pressable,
} from 'react-native';
import { useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import {
  Settings, User, Bell, Moon, Sun, Globe, HelpCircle, LogOut,
} from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { ProfileHeader } from '@features/profile/components/ProfileHeader';
import { RoleChips } from '@features/profile/components/RoleChips';
import { BioSection } from '@features/profile/components/BioSection';
import { ContentTabs } from '@features/profile/components/ContentTabs';
import { PortfolioGrid } from '@features/profile/components/PortfolioGrid';
import { useProfile } from '@features/profile/hooks/useProfile';
import { usePortfolio } from '@features/profile/hooks/usePortfolio';
import { useLogout } from '@features/auth/hooks/useLogout';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore, type Lang } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ProfessionalSkill } from '@core/types/user';
import type { PriceEntry } from '@core/types/project';

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

export default function ProfessionalProfileScreen() {
  const { user, profile, reviews, isLoading, isSaving, save } = useProfile();
  const { assets, upload, addVideoUrl, remove } = usePortfolio();
  const { showToast } = useUiStore();
  const { isLoading: isSigningOut, logout } = useLogout();
  const isDark = useUiStore((s) => s.isDark);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const colors = useTheme();
  const navigation = useNavigation();
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [skills, setSkills] = useState<ProfessionalSkill[]>([]);
  const [bio, setBio] = useState('');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [priceList, setPriceList] = useState<PriceEntry[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const initialised = useRef(false);
  const handleSaveRef = useRef<() => void>(() => {});
  const handleCancelRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('profile.title'),
      headerTintColor: '#004aad',
      headerTitleStyle: { color: '#004aad', fontWeight: '700' as const },
      headerShadowVisible: false,
      headerBackground: () => (
        <LinearGradient
          colors={['#efd4f6', '#b7cae6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      ),
      headerLeft: () => (
        <TouchableOpacity
          style={styles.gearBtn}
          onPress={() => setMenuOpen(true)}
          activeOpacity={0.8}
        >
          <Settings size={26} color="#004aad" strokeWidth={1.5} />
        </TouchableOpacity>
      ),
      headerRight: () =>
        isEditing ? (
          <View style={styles.headerBtns}>
            <TouchableOpacity onPress={() => handleCancelRef.current()} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, { color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}>
                {t('profile.cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleSaveRef.current()} style={styles.headerBtn} disabled={isSaving}>
              {isSaving
                ? <ActivityIndicator size="small" color="#004aad" />
                : <Text style={[styles.headerBtnText, styles.save, { textAlign: rtl ? 'right' : 'left' }]}>
                    {t('profile.save')}
                  </Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.headerBtn}>
            <Text style={[styles.headerBtnText, { color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}>
              {t('profile.edit')}
            </Text>
          </TouchableOpacity>
        ),
    });
  }, [isEditing, isSaving, language]);

  useEffect(() => {
    if (user) setName(user.displayName);
  }, [user?.displayName]);

  useEffect(() => {
    if (profile && !initialised.current) {
      initialised.current = true;
      setSkills(profile.skills ?? []);
      setBio(profile.bio ?? '');
      setEquipment(profile.equipment ?? []);
      setPriceList(profile.priceList ?? []);
    }
  }, [profile]);

  async function handlePhotoPress() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  handleSaveRef.current = handleSave;
  handleCancelRef.current = handleCancel;

  async function handleSave() {
    try {
      await save({ name, photoUri, skills, bio, equipment, priceList });
      setIsEditing(false);
      setPhotoUri(null);
      showToast(t('profile.saved'), 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('profile.failed_save');
      showToast(msg, 'error');
    }
  }

  function handleCancel() {
    if (user) setName(user.displayName);
    if (profile) {
      setSkills(profile.skills ?? []);
      setBio(profile.bio ?? '');
      setEquipment(profile.equipment ?? []);
      setPriceList(profile.priceList ?? []);
    }
    setPhotoUri(null);
    setIsEditing(false);
  }

  if (isLoading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#cb6ce6" />
        </View>
      </Screen>
    );
  }

  const cardStyle = [styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }];

  return (
    <Screen style={styles.content} scrollable>
      <ProfileHeader
        photoURL={photoUri ?? user?.photoURL ?? null}
        name={name}
        isEditing={isEditing}
        onPhotoPress={handlePhotoPress}
        onNameChange={setName}
        rating={profile?.rating ?? 0}
        reviewCount={profile?.reviewCount ?? 0}
        size={90}
      />
      <BioSection bio={bio} isEditing={isEditing} onChange={setBio} />
      <RoleChips selected={skills} isEditing={isEditing} onChange={isEditing ? setSkills : undefined} />

      {!isEditing && (
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Text key={i} style={styles.star}>
              {(profile?.rating ?? 0) >= i - 0.5 ? '★' : '☆'}
            </Text>
          ))}
          <Text style={styles.reviewLabel}>({profile?.reviewCount ?? 0})</Text>
        </View>
      )}

      <ContentTabs
        equipment={equipment}
        reviews={reviews}
        isEditing={isEditing}
        onEquipmentChange={setEquipment}
      />

      <View style={styles.portfolioSection}>
        <Text style={[styles.portfolioTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
          {t('profile.portfolio')}
        </Text>
        <PortfolioGrid
          assets={assets}
          isEditing={isEditing}
          onAdd={upload}
          onAddVideo={addVideoUrl}
          onRemove={remove}
          onError={(msg) => showToast(msg, 'error')}
        />
      </View>

      {/* Settings modal */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable onPress={() => {}} style={cardStyle}>
            <Text style={[styles.menuTitle, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
              {t('profile.settings')}
            </Text>

            <MenuItem
              icon={<User size={18} color={colors.text} strokeWidth={1.5} />}
              label={t('profile.user_information')}
              onPress={() => setMenuOpen(false)}
              colors={colors}
              rtl={rtl}
            />
            <Divider colors={colors} />

            <MenuItem
              icon={<Bell size={18} color={colors.text} strokeWidth={1.5} />}
              label={t('profile.notifications')}
              onPress={() => setMenuOpen(false)}
              colors={colors}
              rtl={rtl}
            />
            <Divider colors={colors} />

            <View style={styles.menuRow}>
              {isDark
                ? <Moon size={18} color={colors.text} strokeWidth={1.5} />
                : <Sun size={18} color={colors.text} strokeWidth={1.5} />}
              <Text style={[styles.menuLabel, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                {isDark ? t('profile.dark_mode') : t('profile.light_mode')}
              </Text>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: '#ccc', true: '#cb6ce6' }}
                thumbColor={isDark ? '#004aad' : '#fff'}
              />
            </View>
            <Divider colors={colors} />

            <View style={styles.menuRow}>
              <Globe size={18} color={colors.text} strokeWidth={1.5} />
              <Text style={[styles.menuLabel, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                {t('profile.language')}
              </Text>
              <View style={[styles.langToggle, { borderColor: colors.border }]}>
                {(['en', 'he'] as Lang[]).map((lang) => {
                  const isActive = language === lang;
                  return (
                    <TouchableOpacity
                      key={lang}
                      style={[styles.langOption, isActive && { backgroundColor: '#004aad' }]}
                      onPress={() => setLanguage(lang)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.langOptionText, { color: isActive ? '#fff' : colors.textMuted }]}>
                        {lang === 'en' ? t('profile.en') : t('profile.he')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <Divider colors={colors} />

            <MenuItem
              icon={<HelpCircle size={18} color={colors.text} strokeWidth={1.5} />}
              label={t('profile.help_support')}
              onPress={() => setMenuOpen(false)}
              colors={colors}
              rtl={rtl}
            />
            <Divider colors={colors} />

            <MenuItem
              icon={<LogOut size={18} color="#e53935" strokeWidth={1.5} />}
              label={t('profile.sign_out')}
              onPress={() => { setMenuOpen(false); logout(); }}
              colors={colors}
              danger
              disabled={isSigningOut}
              rtl={rtl}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function MenuItem({
  icon, label, onPress, colors, danger = false, disabled = false, rtl = false,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  colors: AppColors;
  danger?: boolean;
  disabled?: boolean;
  rtl?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.menuRow, disabled && { opacity: 0.4 }]} onPress={onPress} disabled={disabled} activeOpacity={0.7}>
      <View style={styles.iconWrap}>{icon}</View>
      <Text style={[styles.menuLabel, { color: danger ? '#e53935' : colors.text, textAlign: rtl ? 'right' : 'left' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Divider({ colors }: { colors: AppColors }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  content: { gap: 24, paddingBottom: 100 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  gearBtn: { marginLeft: 8, padding: 4 },
  headerBtns: { flexDirection: 'row', gap: 12 },
  headerBtn: { paddingHorizontal: 8 },
  headerBtnText: { fontSize: 16 },
  save: { fontWeight: '700', color: '#004aad' },

  starsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  star: { fontSize: 36, color: '#cb6ce6' },
  reviewLabel: { fontSize: 13, color: '#cb6ce6', marginLeft: 4, fontWeight: '600' },

  portfolioSection: { gap: 12 },
  portfolioTitle: { fontSize: 18, fontWeight: '700' },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuCard: {
    width: 300,
    borderRadius: 20,
    padding: 20,
    gap: 4,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  iconWrap: { width: 24, alignItems: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  divider: { height: 1, marginHorizontal: -4 },

  langToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  langOption: { paddingHorizontal: 10, paddingVertical: 4 },
  langOptionText: { fontWeight: '700', fontSize: 12 },
});

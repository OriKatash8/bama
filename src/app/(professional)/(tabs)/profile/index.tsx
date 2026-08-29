import { useState, useEffect, useRef } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator, BackHandler, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { Pencil } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { ProfileHeader } from '@features/profile/components/ProfileHeader';
import { BioSection } from '@features/profile/components/BioSection';
import { ContentTabs, type RoleSkill } from '@features/profile/components/ContentTabs';
import { normalizeEquipment } from '@features/profile/equipment';
import type { EquipmentItem } from '@core/types/user';
import { PortfolioGrid } from '@features/profile/components/PortfolioGrid';
import { useProfile } from '@features/profile/hooks/useProfile';
import { usePortfolio } from '@features/profile/hooks/usePortfolio';
import { useUiStore } from '@core/stores/uiStore';
import { useAuthStore } from '@core/stores/authStore';
import { useSwitchMode } from '@features/auth/hooks/useSwitchMode';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { PriceEntry } from '@core/types/project';

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
  const { user, profile, reviews, isLoading, isSaving, save, updateAvailability } = useProfile();
  const { assets, upload, addVideoUrl, remove } = usePortfolio();
  const { showToast } = useUiStore();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [roleSkills, setRoleSkills] = useState<RoleSkill[]>([]);
  const [bio, setBio] = useState('');
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [priceList, setPriceList] = useState<PriceEntry[]>([]);

  const initialised = useRef(false);
  const handleSaveRef = useRef<() => void>(() => {});
  const handleCancelRef = useRef<() => void>(() => {});

  // First-time / incomplete pros are locked here until they save the required fields.
  const locked = useAuthStore((s) => s.proProfileCompleted) === false;
  const { switchMode } = useSwitchMode();

  // Required to complete: a name and at least one role.
  const isComplete = name.trim().length > 0 && roleSkills.length > 0;
  const missing: string[] = [];
  if (!name.trim()) missing.push(t('profile.missing_name'));
  if (roleSkills.length === 0) missing.push(t('profile.missing_role'));

  // Force editing while locked; block Android hardware back so they can't escape
  // into the app without completing (client-mode switch is the only way out).
  useEffect(() => {
    if (locked) setIsEditing(true);
  }, [locked]);

  // Deep link: ?edit=1 opens the editor directly (e.g. the noticeboard
  // "upgrade your profile" CTA).
  const params = useLocalSearchParams<{ edit?: string }>();
  useEffect(() => {
    if (params.edit === '1') setIsEditing(true);
  }, [params.edit]);

  useEffect(() => {
    if (!locked) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [locked]);

  useEffect(() => {
    if (user) setName(user.displayName);
  }, [user?.displayName]);

  useEffect(() => {
    if (profile && !initialised.current) {
      initialised.current = true;
      setRoleSkills(profile.roleSkills ?? []);
      setBio(profile.bio ?? '');
      setEquipment(normalizeEquipment(profile.equipment));
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
      await save({ name, photoUri, roleSkills, bio, equipment, priceList });
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
      setRoleSkills(profile.roleSkills ?? []);
      setBio(profile.bio ?? '');
      setEquipment(normalizeEquipment(profile.equipment));
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

  return (
    <View style={{ flex: 1 }}>
    <Screen style={[styles.content, isEditing && styles.contentEditing]} scrollable>
      {locked && (
        <View style={styles.completeBanner}>
          <AppText weight="semiBold" style={[styles.completeBannerText, { textAlign: rtl ? 'right' : 'left' }]}>
            {t('profile.complete_banner')}
          </AppText>
        </View>
      )}

      {isEditing && !isComplete && (
        <AppText weight="regular" style={[styles.missingHint, { textAlign: rtl ? 'right' : 'left' }]}>
          {t('profile.missing_prefix')}: {missing.join(', ')}
        </AppText>
      )}

      <ProfileHeader
        photoURL={photoUri ?? user?.photoURL ?? null}
        name={name}
        isEditing={isEditing}
        onPhotoPress={handlePhotoPress}
        onNameChange={setName}
        reviews={reviews}
        size={130}
      />

      {!isEditing && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.editPill, { backgroundColor: colors.primary, flexDirection: rtl ? 'row-reverse' : 'row' }]}
            onPress={() => setIsEditing(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Pencil size={16} color="#ffffff" strokeWidth={2} />
            <AppText weight="medium" style={styles.editPillText}>{t('profile.edit_profile')}</AppText>
          </TouchableOpacity>
        </View>
      )}

      <BioSection bio={bio} isEditing={isEditing} onChange={setBio} />
      <ContentTabs
        equipment={equipment}
        reviews={reviews}
        roleSkills={roleSkills}
        isEditing={isEditing}
        onEquipmentChange={setEquipment}
        onRoleSkillsChange={setRoleSkills}
        onRequestEdit={() => setIsEditing(true)}
      />

      <View style={styles.portfolioSection}>
        <AppText weight="bold" style={[styles.portfolioTitle, { color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}>
          {t('profile.portfolio')}
        </AppText>
        <PortfolioGrid
          assets={assets}
          isEditing={isEditing}
          onAdd={upload}
          onAddVideo={addVideoUrl}
          onRemove={remove}
          onError={(msg) => showToast(msg, 'error')}
        />
      </View>
    </Screen>

      {isEditing && (
        <View style={[styles.saveBar, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            style={[styles.saveBarBtn, styles.saveBarCancel]}
            onPress={() => (locked ? switchMode('client') : handleCancelRef.current())}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <AppText weight="semiBold" style={styles.saveBarCancelText}>
              {t(locked ? 'profile.switch_to_client' : 'profile.cancel')}
            </AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBarBtn, styles.saveBarSave, (!isComplete || isSaving) && styles.saveBarSaveDisabled]}
            onPress={() => handleSaveRef.current()}
            disabled={isSaving || !isComplete}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {isSaving
              ? <ActivityIndicator size="small" color="#ffffff" />
              : <AppText weight="bold" style={styles.saveBarSaveText}>{t('profile.save')}</AppText>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24, paddingBottom: 100 },
  contentEditing: { paddingBottom: 180 },
  saveBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'web' ? 100 : 88,
    gap: 12,
  },
  saveBarBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBarCancel: { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#004aad' },
  saveBarCancelText: { color: '#004aad', fontSize: 15 },
  saveBarSave: { backgroundColor: '#004aad' },
  saveBarSaveDisabled: { backgroundColor: '#9aa0b8' },
  saveBarSaveText: { color: '#ffffff', fontSize: 15 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  actionRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: 8,
    // The parent `content` already adds a 24px gap between children; pull the row
    // in so it sits snug under the rating and above "קצת עליי".
    marginTop: -12,
    marginBottom: -12,
  },
  editPill: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  editPillText: { color: '#ffffff', fontSize: 14, fontWeight: '500' },

  completeBanner: {
    backgroundColor: 'rgba(203,108,230,0.12)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: -8,
  },
  completeBannerText: { fontSize: 14, color: '#004aad' },
  missingHint: { fontSize: 13, color: '#e04b4b', marginTop: -12 },

  pageTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#004aad',
    textTransform: 'uppercase',
  },
  portfolioSection: { gap: 12 },
  portfolioTitle: { fontSize: 18, fontWeight: '700' },

});

import { useState, useEffect, useRef } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '@components/layout/Screen';
import { ProfileHeader } from '@features/profile/components/ProfileHeader';
import { BioSection } from '@features/profile/components/BioSection';
import { ContentTabs, type RoleSkill } from '@features/profile/components/ContentTabs';
import { PortfolioGrid } from '@features/profile/components/PortfolioGrid';
import { useProfile } from '@features/profile/hooks/useProfile';
import { usePortfolio } from '@features/profile/hooks/usePortfolio';
import { useUiStore } from '@core/stores/uiStore';
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
  const [equipment, setEquipment] = useState<string[]>([]);
  const [priceList, setPriceList] = useState<PriceEntry[]>([]);

  const initialised = useRef(false);
  const handleSaveRef = useRef<() => void>(() => {});
  const handleCancelRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (user) setName(user.displayName);
  }, [user?.displayName]);

  useEffect(() => {
    if (profile && !initialised.current) {
      initialised.current = true;
      setRoleSkills(profile.roleSkills ?? []);
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

  return (
    <Screen style={styles.content} scrollable>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }} />
        {isEditing ? (
          <View style={styles.headerBtns}>
            <TouchableOpacity onPress={() => handleCancelRef.current()} style={styles.headerBtn}>
              <AppText weight="regular" style={[styles.headerBtnText, { color: '#004aad' }]}>{t('profile.cancel')}</AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleSaveRef.current()} style={styles.headerBtn} disabled={isSaving}>
              {isSaving
                ? <ActivityIndicator size="small" color="#004aad" />
                : <AppText weight="bold" style={[styles.headerBtnText, styles.save]}>{t('profile.save')}</AppText>}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.headerBtn}>
            <AppText weight="regular" style={[styles.headerBtnText, { color: '#004aad' }]}>{t('profile.edit')}</AppText>
          </TouchableOpacity>
        )}
      </View>
      <ProfileHeader
        photoURL={photoUri ?? user?.photoURL ?? null}
        name={name}
        isEditing={isEditing}
        onPhotoPress={handlePhotoPress}
        onNameChange={setName}
        reviews={reviews}
        size={130}
      />
      <BioSection bio={bio} isEditing={isEditing} onChange={setBio} />
      <ContentTabs
        equipment={equipment}
        reviews={reviews}
        roleSkills={roleSkills}
        isEditing={isEditing}
        onEquipmentChange={setEquipment}
        onRoleSkillsChange={setRoleSkills}
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
  );
}

const styles = StyleSheet.create({
  content: { gap: 24, paddingBottom: 100 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerBtns: { flexDirection: 'row', gap: 12 },
  headerBtn: { paddingHorizontal: 8 },
  headerBtnText: { fontSize: 16 },
  save: { fontWeight: '700', color: '#004aad' },

  titleRow: { flexDirection: 'row', alignItems: 'center' },
  pageTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#004aad',
    textTransform: 'uppercase',
  },
  portfolioSection: { gap: 12 },
  portfolioTitle: { fontSize: 18, fontWeight: '700' },

});

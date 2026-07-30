import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '@components/layout/Screen';
import { ProfileHeader } from '@features/profile/components/ProfileHeader';
import { RoleChips } from '@features/profile/components/RoleChips';
import { BioSection } from '@features/profile/components/BioSection';
import { ContentTabs } from '@features/profile/components/ContentTabs';
import { PortfolioGrid } from '@features/profile/components/PortfolioGrid';
import { useProfile } from '@features/profile/hooks/useProfile';
import { usePortfolio } from '@features/profile/hooks/usePortfolio';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ProfessionalSkill } from '@core/types/user';
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
  const { user, profile, reviews, isLoading, isSaving, save } = useProfile();
  const { assets, upload, addVideoUrl, remove } = usePortfolio();
  const { showToast } = useUiStore();
  const colors = useTheme();
  const navigation = useNavigation();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [skills, setSkills] = useState<ProfessionalSkill[]>([]);
  const [bio, setBio] = useState('');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [priceList, setPriceList] = useState<PriceEntry[]>([]);

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

  return (
    <Screen style={styles.content} scrollable>
      <Text style={[styles.pageTitle, { fontFamily: font.bold }]}>
        {t('profile.title')}
      </Text>
      <ProfileHeader
        photoURL={photoUri ?? user?.photoURL ?? null}
        name={name}
        isEditing={isEditing}
        onPhotoPress={handlePhotoPress}
        onNameChange={setName}
        reviews={reviews}
        size={90}
      />
      <BioSection bio={bio} isEditing={isEditing} onChange={setBio} />
      <RoleChips selected={skills} isEditing={isEditing} onChange={isEditing ? setSkills : undefined} />

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

  pageTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#ffffff',
    textShadowColor: '#004aad',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  portfolioSection: { gap: 12 },
  portfolioTitle: { fontSize: 18, fontWeight: '700' },
});

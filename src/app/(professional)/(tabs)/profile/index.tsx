import { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '@components/layout/Screen';
import { ProfileHeader } from '@features/profile/components/ProfileHeader';
import { RoleChips } from '@features/profile/components/RoleChips';
import { BioSection } from '@features/profile/components/BioSection';
import { ContentTabs } from '@features/profile/components/ContentTabs';
import { StarRating } from '@features/profile/components/StarRating';
import { PortfolioGrid } from '@features/profile/components/PortfolioGrid';
import { useProfile } from '@features/profile/hooks/useProfile';
import { usePortfolio } from '@features/profile/hooks/usePortfolio';
import { useLogout } from '@features/auth/hooks/useLogout';
import { useUiStore } from '@core/stores/uiStore';
import type { MediaRole } from '@core/types/media';
import type { PriceEntry } from '@core/types/project';

export default function ProfessionalProfileScreen() {
  const { user, profile, reviews, isLoading, isSaving, save } = useProfile();
  const { assets, upload, remove } = usePortfolio();
  const { showToast } = useUiStore();
  const { isLoading: isSigningOut, logout } = useLogout();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [roles, setRoles] = useState<MediaRole[]>([]);
  const [bio, setBio] = useState('');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [priceList, setPriceList] = useState<PriceEntry[]>([]);

  useEffect(() => {
    if (user) setName(user.displayName);
  }, [user?.displayName]);

  useEffect(() => {
    if (profile) {
      setRoles(profile.roles);
      setBio(profile.bio);
      setEquipment(profile.equipment);
      setPriceList(profile.priceList);
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

  async function handleSave() {
    try {
      await save({ name, photoUri, roles, bio, equipment, priceList });
      setIsEditing(false);
      setPhotoUri(null);
      showToast('Profile saved!', 'success');
    } catch (e: any) {
      showToast(e.message ?? 'Failed to save profile', 'error');
    }
  }

  function handleCancel() {
    if (user) setName(user.displayName);
    if (profile) {
      setRoles(profile.roles);
      setBio(profile.bio);
      setEquipment(profile.equipment);
      setPriceList(profile.priceList);
    }
    setPhotoUri(null);
    setIsEditing(false);
  }

  const gradientText = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  } as any) : {};

  if (isLoading) {
    return (
      <Screen backgroundColor="#0f0f1f">
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#cb6ce6" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={styles.content} backgroundColor="#0f0f1f" scrollable>
      {/* In-screen header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, gradientText]}>My Profile</Text>
        {isEditing ? (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn} activeOpacity={0.8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.saveBtn, isSaving && styles.disabled]}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              {isSaving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveText}>Save</Text>
              }
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editBtn} activeOpacity={0.8}>
            <Text style={styles.editText}>✎  Edit Profile</Text>
          </TouchableOpacity>
        )}
      </View>

      <ProfileHeader
        photoURL={photoUri ?? user?.photoURL ?? null}
        name={name}
        isEditing={isEditing}
        onPhotoPress={handlePhotoPress}
        onNameChange={setName}
      />

      <RoleChips selected={roles} isEditing={isEditing} onChange={setRoles} />
      <BioSection bio={bio} isEditing={isEditing} onChange={setBio} />
      <StarRating rating={profile?.rating ?? 0} reviewCount={profile?.reviewCount ?? 0} />

      <ContentTabs
        equipment={equipment}
        priceList={priceList}
        reviews={reviews}
        isEditing={isEditing}
        onEquipmentChange={setEquipment}
        onPriceListChange={setPriceList}
      />

      <PortfolioGrid
        assets={assets}
        isEditing={isEditing}
        onAdd={upload}
        onRemove={remove}
        onError={(msg) => showToast(msg, 'error')}
      />

      <View style={styles.settings}>
        <Text style={styles.settingsTitle}>Settings</Text>
        <TouchableOpacity
          style={[styles.signOutBtn, isSigningOut && styles.disabled]}
          onPress={logout}
          disabled={isSigningOut}
          activeOpacity={0.8}
        >
          <Text style={styles.signOutText}>
            {isSigningOut ? 'Signing out…' : 'Sign Out'}
          </Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  headerActions: { flexDirection: 'row', gap: 10 },

  editBtn: {
    backgroundColor: 'rgba(203,108,230,0.15)',
    borderWidth: 1.5,
    borderColor: '#cb6ce6',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  editText: { fontSize: 14, fontWeight: '700', color: '#cb6ce6' },

  cancelBtn: {
    borderWidth: 1,
    borderColor: '#ffffff33',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },

  saveBtn: {
    backgroundColor: '#004aad',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
    minWidth: 64,
    alignItems: 'center',
  },
  saveText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  disabled: { opacity: 0.5 },

  settings: {
    borderTopWidth: 1,
    borderTopColor: '#ffffff18',
    paddingTop: 24,
    gap: 20,
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  signOutBtn: {
    backgroundColor: 'rgba(229,57,53,0.12)',
    borderWidth: 1.5,
    borderColor: '#e53935',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  signOutText: { fontSize: 18, color: '#e53935', fontWeight: '700' },
});

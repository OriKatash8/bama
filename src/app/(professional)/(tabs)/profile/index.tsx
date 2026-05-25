import { useState, useEffect, useLayoutEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from 'expo-router';
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
import { useUiStore } from '@core/stores/uiStore';
import type { MediaRole } from '@core/types/media';
import type { PriceEntry } from '@core/types/project';

export default function ProfessionalProfileScreen() {
  const { user, profile, reviews, isLoading, save } = useProfile();
  const { assets, upload, remove } = usePortfolio();
  const { isNewProfessional, setNewProfessional } = useUiStore();
  const navigation = useNavigation();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [roles, setRoles] = useState<MediaRole[]>([]);
  const [bio, setBio] = useState('');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [priceList, setPriceList] = useState<PriceEntry[]>([]);

  useEffect(() => {
    if (isNewProfessional) {
      setIsEditing(true);
      setNewProfessional(false);
    }
  }, []);

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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        isEditing ? (
          <View style={styles.headerBtns}>
            <TouchableOpacity onPress={handleCancel} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, styles.save]}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Edit</Text>
          </TouchableOpacity>
        ),
    });
  }, [isEditing, name, photoUri, roles, bio, equipment, priceList]);

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
    await save({ name, photoUri, roles, bio, equipment, priceList });
    setIsEditing(false);
    setPhotoUri(null);
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

  if (isLoading) return null;

  return (
    <Screen style={styles.content}>
      <ProfileHeader
        photoURL={photoUri ?? user?.photoURL ?? null}
        name={name}
        isEditing={isEditing}
        onPhotoPress={handlePhotoPress}
        onNameChange={setName}
      />
      <RoleChips selected={roles} isEditing={isEditing} onChange={setRoles} />
      <BioSection bio={bio} isEditing={isEditing} onChange={setBio} />
      <ContentTabs
        equipment={equipment}
        priceList={priceList}
        reviews={reviews}
        isEditing={isEditing}
        onEquipmentChange={setEquipment}
        onPriceListChange={setPriceList}
      />
      <StarRating rating={profile?.rating ?? 0} reviewCount={profile?.reviewCount ?? 0} />
      <PortfolioGrid assets={assets} isEditing={isEditing} onAdd={upload} onRemove={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24 },
  headerBtns: { flexDirection: 'row', gap: 12 },
  headerBtn: { paddingHorizontal: 8 },
  headerBtnText: { fontSize: 16, color: '#000' },
  save: { fontWeight: '700' },
});

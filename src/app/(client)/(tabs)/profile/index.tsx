import { useState, useLayoutEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '@components/layout/Screen';
import { ProfileHeader } from '@features/profile/components/ProfileHeader';
import { useClientProfile } from '@features/profile/hooks/useClientProfile';
import { useLogout } from '@features/auth/hooks/useLogout';
import { useUiStore } from '@core/stores/uiStore';

export default function ClientProfileScreen() {
  const { user, isSaving, save } = useClientProfile();
  const { showToast } = useUiStore();
  const { isLoading: isSigningOut, logout } = useLogout();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.displayName ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        isEditing ? (
          <View style={styles.headerBtns}>
            <TouchableOpacity onPress={handleCancel} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.headerBtn} disabled={isSaving}>
              <Text style={[styles.headerBtnText, styles.save, isSaving && { opacity: 0.4 }]}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Edit</Text>
          </TouchableOpacity>
        ),
    });
  }, [isEditing, name, photoUri, isSaving]);

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
      await save(name, photoUri);
      setIsEditing(false);
      setPhotoUri(null);
    } catch (e: any) {
      showToast(e.message ?? 'Failed to save profile', 'error');
    }
  }

  function handleCancel() {
    setName(user?.displayName ?? '');
    setPhotoUri(null);
    setIsEditing(false);
  }

  return (
    <Screen>
      <View style={styles.center}>
        <ProfileHeader
          photoURL={photoUri ?? user?.photoURL ?? null}
          name={name}
          isEditing={isEditing}
          onPhotoPress={handlePhotoPress}
          onNameChange={setName}
        />
      </View>
      <View style={styles.settings}>
        <Text style={styles.settingsTitle}>Settings</Text>
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={logout}
          disabled={isSigningOut}
        >
          <Text style={[styles.signOutText, isSigningOut && { opacity: 0.4 }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', paddingTop: 40 },
  headerBtns: { flexDirection: 'row', gap: 12 },
  headerBtn: { paddingHorizontal: 8 },
  headerBtnText: { fontSize: 16, color: '#000' },
  save: { fontWeight: '700' },
  settings: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 16, gap: 12 },
  settingsTitle: { fontSize: 13, fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
  signOutBtn: { paddingVertical: 12 },
  signOutText: { fontSize: 16, color: '#e53e3e', fontWeight: '500' },
});

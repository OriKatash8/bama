import { useState, useLayoutEffect } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet,
  Platform, Modal, Switch, Pressable,
} from 'react-native';
import { useNavigation } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Settings, User, Bell, Moon, Sun, Globe, HelpCircle, LogOut,
} from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { ProfileHeader } from '@features/profile/components/ProfileHeader';
import { useClientProfile } from '@features/profile/hooks/useClientProfile';
import { useLogout } from '@features/auth/hooks/useLogout';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';

export default function ClientProfileScreen() {
  const { user, isSaving, save } = useClientProfile();
  const { showToast } = useUiStore();
  const { isLoading: isSigningOut, logout } = useLogout();
  const isDark = useUiStore((s) => s.isDark);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.displayName ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = useNavigation();
  const colors = useTheme();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Profile',
      headerRight: () =>
        isEditing ? (
          <View style={styles.headerBtns}>
            <TouchableOpacity onPress={handleCancel} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.headerBtn} disabled={isSaving}>
              <Text style={[styles.headerBtnText, styles.save, isSaving && { opacity: 0.4 }]}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.headerBtn}>
            <Text style={[styles.headerBtnText, { color: colors.text }]}>Edit</Text>
          </TouchableOpacity>
        ),
    });
  }, [isEditing, name, photoUri, isSaving, colors.text]);

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

  const cardStyle = [
    styles.menuCard,
    { backgroundColor: colors.card, borderColor: colors.border },
    Platform.OS === 'web' && ({ boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33' } as any),
  ];

  return (
    <Screen>
      <View style={styles.container}>
        {/* Settings gear button — top-left */}
        <TouchableOpacity
          style={[styles.gearBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setMenuOpen(true)}
          activeOpacity={0.8}
        >
          <Settings size={26} color={colors.text} strokeWidth={1.5} />
        </TouchableOpacity>

        {/* Profile */}
        <View style={styles.center}>
          <ProfileHeader
            photoURL={photoUri ?? user?.photoURL ?? null}
            name={name}
            isEditing={isEditing}
            onPhotoPress={handlePhotoPress}
            onNameChange={setName}
            size={288}
            email={user?.email}
          />
        </View>
      </View>

      {/* Settings modal */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable onPress={() => {}} style={cardStyle}>
            <Text style={[styles.menuTitle, { color: colors.textMuted }]}>Settings</Text>

            <MenuItem
              icon={<User size={18} color={colors.text} strokeWidth={1.5} />}
              label="User Information"
              onPress={() => setMenuOpen(false)}
              colors={colors}
            />
            <Divider colors={colors} />

            <MenuItem
              icon={<Bell size={18} color={colors.text} strokeWidth={1.5} />}
              label="Notifications"
              onPress={() => setMenuOpen(false)}
              colors={colors}
            />
            <Divider colors={colors} />

            {/* Dark / Light mode */}
            <View style={styles.menuRow}>
              {isDark
                ? <Moon size={18} color={colors.text} strokeWidth={1.5} />
                : <Sun size={18} color={colors.text} strokeWidth={1.5} />}
              <Text style={[styles.menuLabel, { color: colors.text }]}>
                {isDark ? 'Dark Mode' : 'Light Mode'}
              </Text>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: '#ccc', true: '#cb6ce6' }}
                thumbColor={isDark ? '#004aad' : '#fff'}
              />
            </View>
            <Divider colors={colors} />

            {/* Language */}
            <View style={styles.menuRow}>
              <Globe size={18} color={colors.text} strokeWidth={1.5} />
              <Text style={[styles.menuLabel, { color: colors.text }]}>English / עברית</Text>
              <View style={[styles.langToggle, { borderColor: colors.border }]}>
                <View style={[styles.langActive, { backgroundColor: '#004aad' }]}>
                  <Text style={styles.langActiveText}>EN</Text>
                </View>
                <View style={styles.langInactive}>
                  <Text style={[styles.langInactiveText, { color: colors.textMuted }]}>עב</Text>
                </View>
              </View>
            </View>
            <Divider colors={colors} />

            <MenuItem
              icon={<HelpCircle size={18} color={colors.text} strokeWidth={1.5} />}
              label="Help & Support"
              onPress={() => setMenuOpen(false)}
              colors={colors}
            />
            <Divider colors={colors} />

            <MenuItem
              icon={<LogOut size={18} color="#e53935" strokeWidth={1.5} />}
              label="Sign Out"
              onPress={() => { setMenuOpen(false); logout(); }}
              colors={colors}
              danger
              disabled={isSigningOut}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function MenuItem({
  icon, label, onPress, colors, danger = false, disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  colors: any;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.menuRow, disabled && { opacity: 0.4 }]} onPress={onPress} disabled={disabled} activeOpacity={0.7}>
      <View style={styles.iconWrap}>{icon}</View>
      <Text style={[styles.menuLabel, { color: danger ? '#e53935' : colors.text }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Divider({ colors }: { colors: any }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gearBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  center: { alignItems: 'center', paddingTop: 40, paddingBottom: 24 },
  headerBtns: { flexDirection: 'row', gap: 12 },
  headerBtn: { paddingHorizontal: 8 },
  headerBtnText: { fontSize: 16 },
  save: { fontWeight: '700', color: '#cb6ce6' },

  // Modal
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

  // Language toggle
  langToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  langActive: { paddingHorizontal: 10, paddingVertical: 4 },
  langActiveText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  langInactive: { paddingHorizontal: 10, paddingVertical: 4 },
  langInactiveText: { fontWeight: '500', fontSize: 12 },
});

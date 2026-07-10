import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@core/hooks/useTheme';

type ProfileHeaderProps = {
  photoURL: string | null;
  name: string;
  isEditing: boolean;
  onPhotoPress?: () => void;
  onNameChange?: (v: string) => void;
  size?: number;
  email?: string;
  rating?: number;
  reviewCount?: number;
};

export function ProfileHeader({
  photoURL,
  name,
  isEditing,
  onPhotoPress,
  onNameChange,
  size = 90,
  email,
  rating,
  reviewCount,
}: ProfileHeaderProps) {
  const colors = useTheme();

  const initials = name
    .split(' ')
    .map((n) => n[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={styles.bannerWrap}>
      <LinearGradient
        colors={['#cb6ce6', '#004aad']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.banner}
      >
        <TouchableOpacity
          onPress={isEditing ? onPhotoPress : undefined}
          disabled={!isEditing}
          activeOpacity={0.8}
          style={[styles.avatarWrap, { width: size, height: size, borderRadius: size / 2 }]}
        >
          {photoURL ? (
            <Image
              source={{ uri: photoURL }}
              style={[styles.avatarImage, { borderRadius: size / 2 }]}
            />
          ) : (
            <View style={[styles.avatarFallback, { borderRadius: size / 2 }]}>
              <Text style={[styles.avatarInitials, { fontSize: size * 0.36 }]}>{initials}</Text>
            </View>
          )}
          {isEditing && (
            <View style={[styles.editOverlay, { borderBottomLeftRadius: size / 2, borderBottomRightRadius: size / 2 }]}>
              <Text style={styles.editOverlayText}>Edit</Text>
            </View>
          )}
        </TouchableOpacity>

        {isEditing ? (
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={onNameChange}
            autoCapitalize="words"
          />
        ) : (
          <Text style={styles.name}>{name}</Text>
        )}

        {email && <Text style={styles.email}>{email}</Text>}
      </LinearGradient>

      {/* Concave bottom curve illusion: rounded-top bg-gradient cap overlaps the gradient */}
      <LinearGradient
        colors={colors.bgGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.concaveCap}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    alignSelf: 'stretch',
    marginHorizontal: -16,
    marginTop: -16,
  },
  banner: {
    height: 270,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 48,
  },
  concaveCap: {
    height: 40,
    marginTop: -40,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  avatarWrap: {
    borderWidth: 3,
    borderColor: '#fff',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  avatarInitials: {
    fontWeight: '700',
    color: '#fff',
  },
  editOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingVertical: 4,
  },
  editOverlayText: { color: '#fff', fontSize: 11, textAlign: 'center', fontWeight: '600' },
  name: { fontSize: 20, fontWeight: '700', color: '#fff' },
  nameInput: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingVertical: 4,
    minWidth: 160,
  },
  email: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
});

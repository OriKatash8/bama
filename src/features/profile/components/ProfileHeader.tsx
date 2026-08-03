import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { AverageRatingDisplay } from '@features/reviews/components/AverageRatingDisplay';
import type { Review } from '@core/types/project';

type ProfileHeaderProps = {
  photoURL: string | null;
  name: string;
  isEditing: boolean;
  onPhotoPress?: () => void;
  onNameChange?: (v: string) => void;
  size?: number;
  email?: string;
  reviews?: Review[];
};

export function ProfileHeader({
  photoURL,
  name,
  isEditing,
  onPhotoPress,
  onNameChange,
  size = 90,
  email,
  reviews,
}: ProfileHeaderProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={styles.headerContent}>
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

      {!isEditing && reviews && <AverageRatingDisplay reviews={reviews} />}
    </View>
  );
}

const styles = StyleSheet.create({
  headerContent: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  avatarWrap: {
    borderWidth: 3,
    borderColor: '#004aad',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    backgroundColor: 'rgba(0,74,173,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  avatarInitials: {
    fontWeight: '700',
    color: '#004aad',
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
  name: { fontSize: 20, fontWeight: '700', color: '#004aad' },
  nameInput: {
    fontSize: 20,
    fontWeight: '700',
    color: '#004aad',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,74,173,0.3)',
    textAlign: 'center',
    paddingVertical: 4,
    minWidth: 160,
  },
  email: { fontSize: 13, color: 'rgba(0,74,173,0.6)' },
});

import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Avatar } from '@components/ui/Avatar';

type ProfileHeaderProps = {
  photoURL: string | null;
  name: string;
  isEditing: boolean;
  onPhotoPress?: () => void;
  onNameChange?: (v: string) => void;
  size?: number;
  email?: string;
};

export function ProfileHeader({
  photoURL,
  name,
  isEditing,
  onPhotoPress,
  onNameChange,
  size = 96,
  email,
}: ProfileHeaderProps) {
  const overlayRadius = size / 2;
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={isEditing ? onPhotoPress : undefined}
        disabled={!isEditing}
        activeOpacity={0.8}
      >
        <Avatar uri={photoURL} name={name} size={size} />
        {isEditing && (
          <View style={[styles.overlay, { borderBottomLeftRadius: overlayRadius, borderBottomRightRadius: overlayRadius }]}>
            <Text style={styles.overlayText}>Edit</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12 },
  name: { fontSize: 22, fontWeight: '700', color: '#fff' },
  email: { fontSize: 14, color: 'rgba(255,255,255,0.45)', marginTop: -4 },
  nameInput: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff44',
    textAlign: 'center',
    paddingVertical: 4,
    minWidth: 160,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 48,
    paddingVertical: 4,
  },
  overlayText: { color: '#fff', fontSize: 11, textAlign: 'center', fontWeight: '600' },
});

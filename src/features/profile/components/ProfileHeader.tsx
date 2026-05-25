import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Avatar } from '@components/ui/Avatar';

type ProfileHeaderProps = {
  photoURL: string | null;
  name: string;
  isEditing: boolean;
  onPhotoPress?: () => void;
  onNameChange?: (v: string) => void;
};

export function ProfileHeader({
  photoURL,
  name,
  isEditing,
  onPhotoPress,
  onNameChange,
}: ProfileHeaderProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={isEditing ? onPhotoPress : undefined}
        disabled={!isEditing}
        activeOpacity={0.8}
      >
        <Avatar uri={photoURL} name={name} size={96} />
        {isEditing && (
          <View style={styles.overlay}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12 },
  name: { fontSize: 22, fontWeight: '700', color: '#000' },
  nameInput: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    textAlign: 'center',
    paddingVertical: 4,
    minWidth: 160,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 48,
    paddingVertical: 4,
  },
  overlayText: { color: '#fff', fontSize: 11, textAlign: 'center', fontWeight: '600' },
});

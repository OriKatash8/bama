import { Text, TextInput, StyleSheet } from 'react-native';

type BioSectionProps = {
  bio: string;
  isEditing: boolean;
  onChange?: (v: string) => void;
};

export function BioSection({ bio, isEditing, onChange }: BioSectionProps) {
  if (!isEditing) {
    return <Text style={styles.text}>{bio || 'No bio yet.'}</Text>;
  }
  return (
    <TextInput
      style={styles.input}
      value={bio}
      onChangeText={onChange}
      multiline
      placeholder="Tell clients about yourself..."
      placeholderTextColor="#aaa"
    />
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, color: '#444', lineHeight: 22 },
  input: {
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
  },
});

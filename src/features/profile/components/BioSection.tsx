import { View, Text, TextInput, StyleSheet } from 'react-native';

type BioSectionProps = {
  bio: string;
  isEditing: boolean;
  onChange?: (v: string) => void;
};

export function BioSection({ bio, isEditing, onChange }: BioSectionProps) {
  if (!isEditing) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>About</Text>
        <Text style={styles.text}>{bio || 'No bio yet.'}</Text>
      </View>
    );
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
  card: {
    borderWidth: 1.5,
    borderColor: '#ffffff18',
    borderRadius: 16,
    backgroundColor: '#1a1a2e',
    padding: 16,
    gap: 8,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#cb6ce6',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  text: { fontSize: 15, color: 'rgba(255,255,255,0.80)', lineHeight: 22 },
  input: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 22,
    borderWidth: 1,
    borderColor: '#ffffff33',
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});

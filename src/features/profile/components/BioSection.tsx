import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTheme } from '@core/hooks/useTheme';
import { useUiStore } from '@core/stores/uiStore';

type BioSectionProps = {
  bio: string;
  isEditing: boolean;
  onChange?: (v: string) => void;
};

export function BioSection({ bio, isEditing, onChange }: BioSectionProps) {
  const colors = useTheme();
  const isDark = useUiStore((s) => s.isDark);
  const cardBg = isDark ? '#ffffff' : colors.card;

  if (!isEditing) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
        <Text style={styles.cardLabel}>About</Text>
        <Text style={[styles.text, { color: '#004aad' }]}>{bio || 'No bio yet.'}</Text>
      </View>
    );
  }
  return (
    <TextInput
      style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
      value={bio}
      onChangeText={onChange}
      multiline
      placeholder="Tell clients about yourself..."
      placeholderTextColor={colors.placeholder}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#004aad',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  text: { fontSize: 15, lineHeight: 22 },
  input: {
    fontSize: 15,
    lineHeight: 22,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
  },
});

import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTheme } from '@core/hooks/useTheme';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

type BioSectionProps = {
  bio: string;
  isEditing: boolean;
  onChange?: (v: string) => void;
};

export function BioSection({ bio, isEditing, onChange }: BioSectionProps) {
  const colors = useTheme();
  const isDark = useUiStore((s) => s.isDark);
  const cardBg = isDark ? '#1a1a2e' : '#ffffff';
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  if (!isEditing) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
        <Text style={[styles.cardLabel, { textAlign: rtl ? 'right' : 'left' }]}>
          {t('profile_sections.about')}
        </Text>
        <Text style={[styles.text, { color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}>
          {bio || t('profile_sections.no_bio')}
        </Text>
      </View>
    );
  }
  return (
    <TextInput
      style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
      value={bio}
      onChangeText={onChange}
      multiline
      placeholder={t('profile_sections.bio_placeholder')}
      placeholderTextColor={colors.placeholder}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
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
    borderRadius: 20,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
  },
});

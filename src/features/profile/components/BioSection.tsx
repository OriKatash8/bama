import { View, TextInput, Text, StyleSheet } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
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
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();

  if (!isEditing) {
    return (
      <View style={{ gap: 6 }}>
        <AppText weight="bold" style={[styles.cardLabel, { textAlign: rtl ? 'right' : 'left' }]}>
          {t('profile_sections.about')}
        </AppText>
        <View style={styles.card}>
          <Text style={[styles.text, bio ? styles.textBio : styles.textEmpty, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
            {bio || t('profile_sections.no_bio')}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <AppText weight="bold" style={[styles.cardLabel, { textAlign: rtl ? 'right' : 'left' }]}>
        {t('profile_sections.about')}
      </AppText>
      <TextInput
        style={[styles.input, { backgroundColor: '#FFFFFF', borderColor: '#EFEDF5', color: '#4C4859', textAlign: rtl ? 'right' : 'left' }]}
        value={bio}
        onChangeText={onChange}
        multiline
        placeholder={t('profile_sections.bio_placeholder')}
        placeholderTextColor="#9C99AD"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFEDF5',
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 15,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A1626',
  },
  text: { fontSize: 14, lineHeight: 22 },
  textBio: { color: '#4C4859' },
  // 13 × 1.55 ≈ 20.
  textEmpty: { fontSize: 13, lineHeight: 20, color: '#9C99AD' },
  input: {
    fontSize: 14,
    lineHeight: 22,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
  },
});

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { CREW_CATEGORIES, CATEGORY_LABEL_KEY } from '@features/crew/data/categories';
import { useTheme } from '@core/hooks/useTheme';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ProfessionalSkill } from '@core/types/user';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

function catLabel(key: string, rtl: boolean, t: (k: string) => string): string {
  return rtl && CATEGORY_LABEL_KEY[key] ? t(CATEGORY_LABEL_KEY[key]) : key;
}

const CATEGORY_EMOJI: Record<string, string> = {
  'Video Photographer': '🎥',
  'Still Photographer': '📸',
  'Editor': '✂️',
  'Graphic Designer': '🎨',
  'Social Media': '📱',
  'Studio & Audio': '🎵',
  'Lighting Tech': '💡',
  'Sound Recordist': '🎤',
};

type RoleChipsProps = {
  selected: ProfessionalSkill[];
  isEditing: boolean;
  onChange?: (skills: ProfessionalSkill[]) => void;
};

function isCategorySelected(selected: ProfessionalSkill[], category: string) {
  return selected.some(s => s.category === category);
}

function toggleCategory(selected: ProfessionalSkill[], category: string): ProfessionalSkill[] {
  if (isCategorySelected(selected, category)) {
    return selected.filter(s => s.category !== category);
  }
  return [...selected, { category }];
}

export function RoleChips({ selected, isEditing, onChange }: RoleChipsProps) {
  const colors = useTheme();
  const isDark = useUiStore((s) => s.isDark);
  const cardBg = isDark ? '#1a1a2e' : '#ffffff';
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const allCategories = Object.keys(CREW_CATEGORIES);

  if (!isEditing) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
        <AppText weight="bold" style={[styles.cardLabel, { textAlign: rtl ? 'right' : 'left' }]}>
          {t('profile_sections.skills')}
        </AppText>
        {selected.length === 0 ? (
          <AppText style={[styles.empty, { textAlign: rtl ? 'right' : 'left' }]}>
            {t('profile_sections.no_skills')}
          </AppText>
        ) : (
          <View style={[styles.chipsWrap, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            {selected.map((s) => (
              <View key={s.category} style={styles.chip}>
                <AppText style={styles.chipText}>
                  {CATEGORY_EMOJI[s.category] ?? ''} {catLabel(s.category, rtl, t)}
                </AppText>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
      <AppText weight="bold" style={[styles.cardLabel, { textAlign: rtl ? 'right' : 'left' }]}>
        {t('profile_sections.skills')}
      </AppText>
      {selected.length > 0 && (
        <View style={[styles.chipsWrap, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          {selected.map((s) => (
            <View key={s.category} style={styles.chip}>
              <AppText style={styles.chipText}>{catLabel(s.category, rtl, t)}</AppText>
            </View>
          ))}
        </View>
      )}
      <View style={styles.tableList}>
        {allCategories.map((category) => {
          const active = isCategorySelected(selected, category);
          return (
            <TouchableOpacity
              key={category}
              style={[styles.tableRow, active && styles.tableRowActive]}
              onPress={() => onChange?.(toggleCategory(selected, category))}
              activeOpacity={0.7}
            >
              <Text style={[styles.tableRowCheck, active && styles.tableRowCheckActive]}>
                {active ? '✓' : ''}
              </Text>
              <AppText style={[styles.tableRowText, active && styles.tableRowTextActive]}>
                {catLabel(category, rtl, t)}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#004aad',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  empty: { color: 'rgba(0,74,173,0.4)', fontSize: 13, fontStyle: 'italic' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0,74,173,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.2)',
  },
  chipText: { fontSize: 13, color: '#004aad' },
  tableList: { gap: 2, marginTop: 4 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,74,173,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.1)',
  },
  tableRowActive: { backgroundColor: 'rgba(0,74,173,0.1)', borderColor: '#004aad' },
  tableRowCheck: { width: 20, fontSize: 13, color: '#004aad', fontWeight: '700' },
  tableRowCheckActive: { color: '#004aad' },
  tableRowText: { fontSize: 14, color: 'rgba(0,74,173,0.6)', fontWeight: '500', flex: 1 },
  tableRowTextActive: { color: '#004aad', fontWeight: '700' },
});

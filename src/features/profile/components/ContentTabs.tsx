import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CATEGORY_LABEL_KEY } from '@features/crew/data/categories';
import type { ProfessionalSkill } from '@core/types/user';
import { ReviewsList } from './ReviewsList';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { Review } from '@core/types/project';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

type SectionKey = 'equipment' | 'reviews' | 'skills';

const SECTION_KEYS: SectionKey[] = ['equipment', 'reviews', 'skills'];

type ContentTabsProps = {
  equipment: string[];
  reviews: Review[];
  skills?: ProfessionalSkill[];
  isEditing: boolean;
  onEquipmentChange?: (items: string[]) => void;
};

export function ContentTabs({
  equipment,
  reviews,
  skills,
  isEditing,
  onEquipmentChange,
}: ContentTabsProps) {
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const [active, setActive] = useState<SectionKey>('equipment');
  const [newEquipment, setNewEquipment] = useState('');

  function sectionLabel(key: SectionKey): string {
    const map: Record<SectionKey, string> = {
      equipment: t('profile_sections.equipment'),
      reviews:   t('profile_sections.reviews'),
      skills:    t('profile_sections.skills'),
    };
    return map[key];
  }

  function addEquipment() {
    const trimmed = newEquipment.trim();
    if (!trimmed || !onEquipmentChange) return;
    onEquipmentChange([...equipment, trimmed]);
    setNewEquipment('');
  }

  return (
    <View>

      {/* ── Tab bar ── */}
      <View style={styles.tabBar}>
        {SECTION_KEYS.map((key) => {
          const isActive = key === active;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setActive(key)}
              activeOpacity={0.8}
            >
              {isActive ? (
                <LinearGradient
                  colors={['#004aad', '#cb6ce6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.tabActive}
                >
                  <Text style={[styles.tabText, { color: '#fff', textAlign: rtl ? 'right' : 'left' }]}>
                    {sectionLabel(key)}
                  </Text>
                </LinearGradient>
              ) : (
                <View style={styles.tab}>
                  <Text style={[styles.tabText, { color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}>
                    {sectionLabel(key)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Content (no card background) ── */}
      <View style={styles.panel}>

        {/* Equipment */}
        {active === 'equipment' && (
          <>
            {equipment.length === 0 && (
              <Text style={[styles.empty, { textAlign: 'center' }]}>
                {t('profile_sections.no_equipment')}
              </Text>
            )}
            <View style={styles.list}>
              {equipment.map((item, index) => (
                <View
                  key={`eq-${index}`}
                  style={[
                    styles.itemRow,
                    index < equipment.length - 1 && styles.itemRowDivider,
                  ]}
                >
                  {isEditing && (
                    <TouchableOpacity
                      onPress={() => onEquipmentChange?.(equipment.filter((_, i) => i !== index))}
                      hitSlop={8}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.removeBtn}>×</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={[styles.itemText, { textAlign: 'center' }]}>{item}</Text>
                </View>
              ))}
            </View>
            {isEditing && (
              <View style={styles.addRow}>
                <TouchableOpacity style={styles.addBtn} onPress={addEquipment} activeOpacity={0.8}>
                  <Text style={styles.addBtnText}>+</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.addInput, { borderColor: colors.border, textAlign: rtl ? 'right' : 'left' }]}
                  value={newEquipment}
                  onChangeText={setNewEquipment}
                  placeholder={t('profile_sections.add_item')}
                  placeholderTextColor="rgba(0,74,173,0.4)"
                  onSubmitEditing={addEquipment}
                  returnKeyType="done"
                />
              </View>
            )}
          </>
        )}

        {/* Reviews */}
        {active === 'reviews' && <ReviewsList reviews={reviews} />}

        {/* Skills */}
        {active === 'skills' && (
          <>
            {(skills ?? []).length === 0 ? (
              <Text style={[styles.empty, { textAlign: 'center' }]}>
                {t('profile_sections.no_skills')}
              </Text>
            ) : (
              <View style={styles.skillsCard}>
                <View style={styles.chipsWrap}>
                  {(skills ?? []).map((s, i) => (
                    <View key={`${s.category}-${i}`} style={styles.chip}>
                      <Text style={styles.chipText}>
                        {rtl && CATEGORY_LABEL_KEY[s.category] ? t(CATEGORY_LABEL_KEY[s.category]) : s.category}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Tab bar */
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
  },
  tabActive: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },

  /* Content */
  panel: {
    paddingVertical: 8,
    gap: 12,
  },

  /* Single-card item list */
  list: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  itemRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,74,173,0.08)',
  },

  itemText: {
    flex: 1,
    fontSize: 14,
    color: '#004aad',
    textAlign: 'center',
  },
  removeBtn: {
    fontSize: 20,
    color: '#e53935',
    fontWeight: '700',
    lineHeight: 22,
    paddingHorizontal: 2,
  },

  /* Add row */
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#004aad',
    backgroundColor: 'rgba(0,74,173,0.06)',
  },

  empty: {
    textAlign: 'center',
    fontSize: 14,
    color: 'rgba(0,74,173,0.4)',
    paddingVertical: 12,
  },

  skillsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    padding: 16,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.2)',
  },
  chipText: { fontSize: 12, color: '#004aad' },
});

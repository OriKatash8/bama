import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
} from 'react-native';
import { Wrench, Star } from 'lucide-react-native';
import { ReviewsList } from './ReviewsList';
import { useTheme } from '@core/hooks/useTheme';
import { useUiStore } from '@core/stores/uiStore';
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

type SectionKey = 'equipment' | 'reviews';

const SECTION_ICONS: Record<SectionKey, React.ComponentType<{ size: number; color: string; strokeWidth: number }>> = {
  equipment: Wrench,
  reviews:   Star,
};

const SECTION_KEYS: SectionKey[] = ['equipment', 'reviews'];

type ContentTabsProps = {
  equipment: string[];
  reviews: Review[];
  isEditing: boolean;
  onEquipmentChange?: (items: string[]) => void;
};

export function ContentTabs({
  equipment,
  reviews,
  isEditing,
  onEquipmentChange,
}: ContentTabsProps) {
  const colors = useTheme();
  const isDark = useUiStore((s) => s.isDark);
  const cardBg = isDark ? '#1a1a2e' : '#ffffff';
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const [active, setActive] = useState<SectionKey>('equipment');
  const [newEquipment, setNewEquipment] = useState('');

  const sectionLabel = (key: SectionKey): string => {
    const map: Record<SectionKey, string> = {
      equipment: t('profile_sections.equipment'),
      reviews:   t('profile_sections.reviews'),
    };
    return map[key];
  };

  const ActiveIcon = SECTION_ICONS[active];

  function addEquipment() {
    const trimmed = newEquipment.trim();
    if (!trimmed || !onEquipmentChange) return;
    onEquipmentChange([...equipment, trimmed]);
    setNewEquipment('');
  }

  return (
    <View>

      {/* ── Tab bar (no card background) ── */}
      <View style={styles.tabBar}>
        {SECTION_KEYS.map((key) => {
          const isActive = key === active;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActive(key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, { color: isActive ? '#fff' : 'rgba(0,74,173,0.45)', textAlign: rtl ? 'right' : 'left' }]}>
                {sectionLabel(key)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Content card ── */}
      <View style={[styles.panel, { backgroundColor: cardBg, borderColor: colors.border }]}>

        {/* Section header */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}>
            {sectionLabel(active)}
          </Text>
          <ActiveIcon size={18} color="#004aad" strokeWidth={1.8} />
        </View>

        {/* Equipment */}
        {active === 'equipment' && (
          <>
            {equipment.length === 0 && (
              <Text style={[styles.empty, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('profile_sections.no_equipment')}
              </Text>
            )}
            <View style={styles.list}>
              {equipment.map((item, index) => (
                <View
                  key={`eq-${index}`}
                  style={[
                    styles.itemRow,
                    { borderBottomColor: colors.border },
                    index === 0 && styles.firstRow,
                    index === equipment.length - 1 ? styles.lastRow : styles.rowBorder,
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
                  <Text style={[styles.itemText, { textAlign: rtl ? 'right' : 'left' }]}>{item}</Text>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Tab bar — no card background */
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
  },
  tabActive: {
    backgroundColor: '#cb6ce6',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },

  /* Content card */
  panel: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
    color: '#004aad',
  },

  /* Item list */
  list: { borderRadius: 8, overflow: 'hidden' },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,74,173,0.06)',
    gap: 8,
  },
  firstRow: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  lastRow: {
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  itemText: {
    flex: 1,
    fontSize: 14,
    color: '#004aad',
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
});

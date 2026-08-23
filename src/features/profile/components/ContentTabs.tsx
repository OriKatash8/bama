import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Animated,
} from 'react-native';
import { ROLES, getSpecializations, labelOf, type Labeled } from '@features/crew/data/categories';
import { ReviewsList } from './ReviewsList';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
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

export type RoleSkill = { role: string; specializations: string[] };

type ContentTabsProps = {
  equipment: string[];
  reviews: Review[];
  roleSkills?: RoleSkill[];
  isEditing: boolean;
  onEquipmentChange?: (items: string[]) => void;
  onRoleSkillsChange?: (next: RoleSkill[]) => void;
};

export function ContentTabs({
  equipment,
  reviews,
  roleSkills,
  isEditing,
  onEquipmentChange,
  onRoleSkillsChange,
}: ContentTabsProps) {
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';
  const font = useAppFont();

  const rs: RoleSkill[] = roleSkills ?? [];
  const rowDir = rtl ? 'row-reverse' : ('row' as const);

  function labelById(items: Labeled[], id: string): string {
    const found = items.find((x) => x.id === id);
    return found ? labelOf(found, lang) : id;
  }
  function toggleRole(roleId: string) {
    const exists = rs.some((e) => e.role === roleId);
    const next = exists
      ? rs.filter((e) => e.role !== roleId)
      : [...rs, { role: roleId, specializations: ['general'] }];
    onRoleSkillsChange?.(next);
  }
  function toggleInEntry(roleId: string, field: 'specializations', id: string) {
    const next = rs.map((e) => {
      if (e.role !== roleId) return e;
      const has = e[field].includes(id);
      return { ...e, [field]: has ? e[field].filter((x) => x !== id) : [...e[field], id] };
    });
    onRoleSkillsChange?.(next);
  }

  const [active, setActive] = useState<SectionKey>('equipment');
  const [newEquipment, setNewEquipment] = useState('');
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;

  function sectionLabel(key: SectionKey): string {
    const map: Record<SectionKey, string> = {
      equipment: t('profile_sections.equipment'),
      reviews:   t('profile_sections.reviews'),
      skills:    t('profile_sections.skills'),
    };
    return map[key];
  }

  function switchTab(key: SectionKey) {
    const idx = SECTION_KEYS.indexOf(key);
    setActive(key);
    Animated.timing(slideAnim, {
      toValue: idx,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }

  function addEquipment() {
    const trimmed = newEquipment.trim();
    if (!trimmed || !onEquipmentChange) return;
    onEquipmentChange([...equipment, trimmed]);
    setNewEquipment('');
  }

  const pillWidth = tabBarWidth / 3;

  return (
    <View style={styles.wrapper}>

      {/* ── Tab bar card ── */}
      <View style={styles.tabCard}>
      <View
        style={styles.tabBar}
        onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width)}
      >
        {/* Sliding pill behind labels */}
        {tabBarWidth > 0 && (
          <Animated.View
            style={[
              styles.slidingPill,
              {
                width: pillWidth - 8,
                transform: [{
                  translateX: slideAnim.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: [4, pillWidth + 4, pillWidth * 2 + 4],
                  }),
                }],
              },
            ]}
          />
        )}

        {/* Labels on top of pill */}
        {SECTION_KEYS.map((key) => (
          <TouchableOpacity
            key={key}
            style={styles.tab}
            onPress={() => switchTab(key)}
            activeOpacity={0.8}
          >
            <AppText weight="semiBold" style={[styles.tabText, { color: active === key ? '#fff' : '#004aad' }]}>
              {sectionLabel(key)}
            </AppText>
          </TouchableOpacity>
        ))}
      </View>
      </View>

      {/* ── Content card ── */}
      <View style={styles.contentCard}>
      <View style={styles.panel}>

        {/* Equipment */}
        {active === 'equipment' && (
          <>
            {equipment.length === 0 && (
              <AppText weight="regular" style={styles.empty}>
                {t('profile_sections.no_equipment')}
              </AppText>
            )}
            {equipment.length > 0 && (
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
                    <AppText weight="regular" style={styles.itemText}>{item}</AppText>
                  </View>
                ))}
              </View>
            )}
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

        {/* Skills (roles → subskills/specializations) */}
        {active === 'skills' && (
          <>
            {isEditing ? (
              <View style={{ gap: 14 }}>
                {/* Level 1 — role checklist */}
                <View style={styles.tableList}>
                  {ROLES.map((role) => {
                    const isSelected = rs.some((e) => e.role === role.id);
                    return (
                      <TouchableOpacity
                        key={role.id}
                        style={[styles.tableRow, isSelected && styles.tableRowActive]}
                        onPress={() => toggleRole(role.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.tableRowCheck, isSelected && styles.tableRowCheckActive]}>
                          {isSelected ? '✓' : ''}
                        </Text>
                        <AppText weight="medium" style={[styles.tableRowText, isSelected && styles.tableRowTextActive]}>
                          {labelOf(role, lang)}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Level 2 — per selected role: subskills/specializations */}
                {ROLES.filter((role) => rs.some((e) => e.role === role.id)).map((role) => {
                  const entry = rs.find((e) => e.role === role.id)!;
                  const specs = getSpecializations(role.id);
                  return (
                    <View key={`blk-${role.id}`} style={styles.roleBlock}>
                      <AppText weight="bold" style={[styles.roleBlockTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                        {labelOf(role, lang)}
                      </AppText>

                      <AppText weight="semiBold" style={[styles.subLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('profile_sections.specializations')}
                      </AppText>
                      <View style={[styles.pillsWrap, { flexDirection: rowDir }]}>
                        {specs.map((sp) => {
                          const on = entry.specializations.includes(sp.id);
                          return (
                            <TouchableOpacity
                              key={sp.id}
                              style={[styles.pill, on && styles.pillActive]}
                              onPress={() => toggleInEntry(role.id, 'specializations', sp.id)}
                              activeOpacity={0.7}
                            >
                              <AppText weight="semiBold" style={[styles.pillText, on && styles.pillTextActive]}>
                                {labelOf(sp, lang)}
                              </AppText>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              rs.length === 0 ? (
                <AppText weight="regular" style={styles.empty}>{t('profile_sections.no_skills')}</AppText>
              ) : (
                <View style={{ gap: 12 }}>
                  {ROLES.filter((role) => rs.some((e) => e.role === role.id)).map((role) => {
                    const entry = rs.find((e) => e.role === role.id)!;
                    const specs = getSpecializations(role.id);
                    return (
                      <View key={`ro-${role.id}`} style={styles.roleBlock}>
                        <AppText weight="bold" style={[styles.roleBlockTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                          {labelOf(role, lang)}
                        </AppText>
                        <View style={[styles.chipsWrap, { flexDirection: rowDir, justifyContent: 'flex-start' }]}>
                          {entry.specializations.map((id) => (
                            <View key={`sp-${id}`} style={styles.chip}>
                              <AppText weight="regular" style={styles.chipText}>{labelById(specs, id)}</AppText>
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )
            )}
          </>
        )}
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 12,
  },
  tabCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'hidden',
  },
  contentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'hidden',
  },
  /* Tab bar */
  tabBar: {
    flexDirection: 'row',
    height: 48,
    position: 'relative',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  slidingPill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 100,
    backgroundColor: '#004aad',
  },
  /* Content */
  panel: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 12,
  },

  /* Equipment list */
  list: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.08)',
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: 'rgba(0,74,173,0.05)',
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

  /* Skills table (edit mode) */
  tableList: { gap: 2 },
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

  /* Skills chips (view mode) */
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#004aad',
  },
  chipText: { fontSize: 12, color: '#ffffff' },

  /* Roles → subskills/specializations */
  roleBlock: {
    backgroundColor: 'rgba(0,74,173,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.1)',
    padding: 12,
    gap: 8,
  },
  roleBlockTitle: { fontSize: 14, color: '#004aad' },
  subLabel: { fontSize: 12, color: 'rgba(0,74,173,0.6)' },
  pillsWrap: { flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#004aad',
    backgroundColor: '#ffffff',
  },
  pillActive: { backgroundColor: '#004aad' },
  pillText: { fontSize: 12, color: '#004aad' },
  pillTextActive: { color: '#ffffff' },
});

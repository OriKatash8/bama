import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Animated,
} from 'react-native';
import { ChevronDown, X } from 'lucide-react-native';
import { ROLES, getSpecializations, labelOf, type Labeled } from '@features/crew/data/categories';
import {
  EQUIPMENT_CATEGORIES,
  equipmentCategoryLabelKey,
  groupEquipment,
  normalizeEquipment,
  type EquipmentItem,
} from '@features/profile/equipment';
import { ReviewsList } from './ReviewsList';
import { AppText } from '@components/ui/AppText';
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

const TRACK_PAD = 3;
const TRACK_GAP = 3;

export type RoleSkill = { role: string; specializations: string[] };

type ContentTabsProps = {
  equipment: (string | EquipmentItem)[];
  reviews: Review[];
  roleSkills?: RoleSkill[];
  isEditing: boolean;
  onEquipmentChange?: (items: EquipmentItem[]) => void;
  onRoleSkillsChange?: (next: RoleSkill[]) => void;
  /** Own-profile only: invoked by the empty-state "add equipment" action to
   *  enter edit mode. Omitted on read-only (browse) profiles. */
  onRequestEdit?: () => void;
};

export function ContentTabs({
  equipment,
  reviews,
  roleSkills,
  isEditing,
  onEquipmentChange,
  onRoleSkillsChange,
  onRequestEdit,
}: ContentTabsProps) {
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
  // Equipment categories and skill roles start closed; tapping a heading opens
  // it. Keys are 'eq:<category>' / 'sk:<role>'.
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());
  function toggleSection(key: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** A tappable section heading with a chevron that points down when closed
   *  and up when open. */
  function sectionHeader(key: string, title: string) {
    const isOpen = openSections.has(key);
    return (
      <TouchableOpacity
        style={[styles.sectionHeader, { flexDirection: rowDir }]}
        onPress={() => toggleSection(key)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        testID={`section-${key}`}
      >
        <AppText weight="bold" style={[styles.eqGroupTitle, styles.sectionTitle, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
          {title}
        </AppText>
        <View style={isOpen && styles.chevronOpen}>
          <ChevronDown size={18} color="#1D4ED8" strokeWidth={2.2} />
        </View>
      </TouchableOpacity>
    );
  }
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

  const equipInputRef = useRef<TextInput>(null);
  // Normalize legacy string items + new objects into a single shape.
  const equipmentItems = normalizeEquipment(equipment);
  const [newEquipmentCat, setNewEquipmentCat] = useState<string>('camera');

  function addEquipment() {
    const trimmed = newEquipment.trim();
    if (!trimmed || !onEquipmentChange) return;
    onEquipmentChange([...equipmentItems, { name: trimmed, category: newEquipmentCat }]);
    setNewEquipment('');
  }

  // Segmented track: three equal segments inside a 3pt padding with 3pt gaps.
  const segWidth = (tabBarWidth - TRACK_PAD * 2 - TRACK_GAP * 2) / 3;

  return (
    <View style={styles.wrapper}>

      {/* ── Segmented track ── */}
      <View
        style={styles.tabBar}
        onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width)}
      >
        {/* Selected segment, sliding behind the labels */}
        {tabBarWidth > 0 && (
          <Animated.View
            style={[
              styles.slidingPill,
              {
                width: segWidth,
                transform: [{
                  translateX: slideAnim.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: [
                      TRACK_PAD,
                      TRACK_PAD + segWidth + TRACK_GAP,
                      TRACK_PAD + (segWidth + TRACK_GAP) * 2,
                    ],
                  }),
                }],
              },
            ]}
          />
        )}

        {/* Labels on top of the selected segment */}
        {SECTION_KEYS.map((key) => (
          <TouchableOpacity
            key={key}
            style={styles.tab}
            onPress={() => switchTab(key)}
            activeOpacity={0.8}
            hitSlop={{ top: 5, bottom: 5 }}
          >
            <AppText weight="semiBold" style={[styles.tabText, { color: active === key ? '#FFFFFF' : '#000000' }]}>
              {sectionLabel(key)}
            </AppText>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Content card ── */}
      <View style={styles.contentCard}>
      <View style={styles.panel}>

        {/* Equipment */}
        {active === 'equipment' && (
          <>
            {equipmentItems.length === 0 && !isEditing ? (
              <View style={[styles.eqEmptyWrap, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                <AppText weight="regular" style={styles.empty}>
                  {t('profile_sections.no_equipment')}
                </AppText>
                {onRequestEdit && (
                  <TouchableOpacity onPress={onRequestEdit} accessibilityRole="button" style={styles.eqAddLinkBtn} activeOpacity={0.7}>
                    <AppText weight="semiBold" style={styles.eqAddLink}>
                      {t('profile_sections.add_equipment')}
                    </AppText>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={isEditing ? styles.eqGroups : null}>
                {groupEquipment(equipmentItems).map((group, gi) => (
                  <View key={group.category} style={isEditing ? styles.eqGroup : null}>
                    {isEditing ? (
                      <AppText weight="bold" style={[styles.eqGroupTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t(equipmentCategoryLabelKey(group.category))}
                      </AppText>
                    ) : (
                      <>
                        {gi > 0 && <View style={styles.sectionDivider} />}
                        {sectionHeader(`eq:${group.category}`, t(equipmentCategoryLabelKey(group.category)))}
                      </>
                    )}
                    {(isEditing || openSections.has(`eq:${group.category}`)) && (
                      <View style={[styles.chipsWrap, !isEditing && styles.sectionBody, { flexDirection: rowDir, justifyContent: 'flex-start' }]}>
                        {group.entries.map(({ item, index }) => (
                          <View key={`eq-${index}`} style={[styles.chip, styles.eqChip, { flexDirection: rowDir }]}>
                            <AppText weight="semiBold" numberOfLines={1} style={styles.chipText}>
                              {item.name}
                            </AppText>
                            {isEditing && (
                              <TouchableOpacity
                                onPress={() => onEquipmentChange?.(equipmentItems.filter((_, i) => i !== index))}
                                hitSlop={16}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                              >
                                <X size={12} color="#1D4ED8" strokeWidth={2.5} />
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {isEditing && (
              <View style={styles.addSection}>
                <View style={[styles.addRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <TouchableOpacity style={styles.addBtn} onPress={addEquipment} activeOpacity={0.8}>
                    <Text style={styles.addBtnText}>+</Text>
                  </TouchableOpacity>
                  <TextInput
                    ref={equipInputRef}
                    style={[styles.addInput, { textAlign: rtl ? 'right' : 'left' }]}
                    value={newEquipment}
                    onChangeText={setNewEquipment}
                    placeholder={t('profile_sections.add_item')}
                    placeholderTextColor="#9C99AD"
                    onSubmitEditing={addEquipment}
                    returnKeyType="done"
                  />
                </View>
                {/* Category picker — the chosen category is applied to the next added item. */}
                <AppText weight="semiBold" style={[styles.subLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                  {t('profile_sections.eq_pick_category')}
                </AppText>
                <View style={[styles.pillsWrap, { flexDirection: rowDir }]}>
                  {EQUIPMENT_CATEGORIES.map((cat) => {
                    const selected = newEquipmentCat === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() => setNewEquipmentCat(cat.id)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        style={[styles.pill, selected && styles.pillActive]}
                      >
                        <AppText weight="semiBold" style={[styles.pillText, selected && styles.pillTextActive]}>
                          {t(equipmentCategoryLabelKey(cat.id))}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
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
                <View>
                  {ROLES.filter((role) => rs.some((e) => e.role === role.id)).map((role, ri) => {
                    const entry = rs.find((e) => e.role === role.id)!;
                    const specs = getSpecializations(role.id);
                    return (
                      <View key={`ro-${role.id}`}>
                        {ri > 0 && <View style={styles.sectionDivider} />}
                        {sectionHeader(`sk:${role.id}`, labelOf(role, lang))}
                        {openSections.has(`sk:${role.id}`) && (
                          <View style={[styles.chipsWrap, styles.sectionBody, { flexDirection: rowDir, justifyContent: 'flex-start' }]}>
                            {entry.specializations.map((id) => (
                              <View key={`sp-${id}`} style={styles.chip}>
                                <AppText weight="semiBold" style={styles.chipText}>{labelById(specs, id)}</AppText>
                              </View>
                            ))}
                          </View>
                        )}
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
  contentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EFEDF5',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  /* Segmented track */
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1EFF8',
    borderRadius: 999,
    padding: TRACK_PAD,
    gap: TRACK_GAP,
    position: 'relative',
  },
  tab: {
    flex: 1,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  slidingPill: {
    position: 'absolute',
    top: TRACK_PAD,
    left: 0,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#1D4ED8',
  },
  /* Content */
  panel: {
    padding: 14,
    gap: 14,
  },

  /* Equipment: category groups inside the one card */
  eqGroups: { gap: 14 },
  eqGroup: { gap: 8 },
  eqGroupTitle: { fontSize: 12.5, fontWeight: '700', color: '#000000' },
  /* Collapsible sections (equipment categories, skill roles) */
  sectionHeader: { minHeight: 44, alignItems: 'center', gap: 8 },
  sectionTitle: { flex: 1, fontSize: 14 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  sectionBody: { paddingBottom: 12 },
  sectionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#EFEDF5' },
  eqChip: { alignItems: 'center', gap: 5, maxWidth: '100%' },
  eqEmptyWrap: { gap: 8 },
  eqAddLinkBtn: { minHeight: 44, justifyContent: 'center' },
  eqAddLink: { fontSize: 13, color: '#1D4ED8' },
  addSection: { gap: 8 },

  /* Add row */
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
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
    borderColor: '#EAE8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#000000',
    backgroundColor: '#F6F5FA',
  },

  empty: {
    textAlign: 'center',
    fontSize: 13,
    color: '#000000',
    paddingVertical: 12,
  },

  /* Skills table (edit mode) */
  tableList: { gap: 2 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F6F5FA',
    borderWidth: 1,
    borderColor: '#EFEDF5',
  },
  tableRowActive: { backgroundColor: '#E6EDFC', borderColor: '#1D4ED8' },
  tableRowCheck: { width: 20, fontSize: 13, color: '#1D4ED8', fontWeight: '700' },
  tableRowCheckActive: { color: '#1D4ED8' },
  tableRowText: { fontSize: 14, color: '#000000', fontWeight: '500', flex: 1 },
  tableRowTextActive: { color: '#000000', fontWeight: '700' },

  /* Chips: neutral labels (equipment + skills view mode) */
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F6F5FA',
    borderWidth: 1,
    borderColor: '#EAE8F0',
  },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#000000' },

  /* Roles → subskills/specializations */
  roleBlock: {
    backgroundColor: '#FAF9FD',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EFEDF5',
    padding: 12,
    gap: 8,
  },
  roleBlockTitle: { fontSize: 14, color: '#000000' },
  subLabel: { fontSize: 12, color: '#000000' },
  pillsWrap: { flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#FFFFFF',
  },
  pillActive: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
  pillText: { fontSize: 12, color: '#000000' },
  pillTextActive: { color: '#FFFFFF' },
});

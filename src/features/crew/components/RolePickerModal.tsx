import { useState } from 'react';
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useCrewBuilder } from '../hooks/useCrewBuilder';
import { CATEGORIES, CATEGORY_ICON } from '../data/roleTiles';
import { ROLE_BY_ID, getSpecializations, labelOf } from '../data/categories';
import type { CrewRequestSlot } from '@core/types/project';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string | number>): string => {
    let result: unknown = translations;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    if (typeof result !== 'string') return key;
    return vars ? result.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? '')) : result;
  };
}

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onPost: (slots: CrewRequestSlot[]) => void;
  isPosting?: boolean;
};

const COLUMNS = 2; // same as the home builder's role step
const GAP = 8;
const SHEET_PADDING = 16;
const ACCENT = '#cb6ce6';

/**
 * "Add professional" on project details: a compact version of the home builder's
 * step 2 (roles + how many) and step 3 (a subskill per slot), in one bottom sheet.
 * Same selection state as the home builder (useCrewBuilder) and the same role tiles
 * (data/roleTiles), so a slot posted from here is shaped exactly like one posted
 * when the project was created.
 */
export function RolePickerModal({ visible, onDismiss, onPost, isPosting = false }: Props) {
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';

  const { slots, totalCount, roleQuantity, setQuantity, slotCaps, setSlotCapability, reset } = useCrewBuilder();
  const [step, setStep] = useState<1 | 2>(1);

  const rowDir = rtl ? 'row-reverse' : 'row';
  const textAlign = rtl ? 'right' : 'left';
  const [gridWidth, setGridWidth] = useState(0);
  const tileWidth = gridWidth > 0 ? Math.floor((gridWidth - GAP * (COLUMNS - 1)) / COLUMNS) : undefined;
  const BackChevron = rtl ? ChevronRight : ChevronLeft;

  function handleDismiss() {
    reset();
    setStep(1);
    onDismiss();
  }

  function handlePost() {
    if (slots.length === 0) return;
    onPost(slots);
    reset();
    setStep(1);
  }

  const chosenCategories = [...new Set(slots.map((s) => s.category))];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={[styles.header, { flexDirection: rowDir }]}>
            <View style={{ flex: 1 }}>
              <AppText weight="bold" style={[styles.title, { textAlign }]}>
                {t('project_details.add_professional')}
              </AppText>
              <View style={[styles.stepRow, { flexDirection: rowDir }]}>
                <AppText weight="regular" style={styles.stepLabel}>
                  {t('project_details.add_pro_step_of', { n: step })}
                </AppText>
                <AppText weight="semiBold" style={styles.stepName}>
                  {step === 1 ? t('project_details.add_pro_step_roles') : t('project_details.add_pro_step_subskills')}
                </AppText>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleDismiss}
              hitSlop={12}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('project_details.add_pro_close')}
            >
              <X size={22} color="#004aad" />
            </TouchableOpacity>
          </View>

          <View style={[styles.progressRow, { flexDirection: rowDir }]}>
            <View style={[styles.progressBar, styles.progressOn]} />
            <View style={[styles.progressBar, step === 2 ? styles.progressOn : styles.progressOff]} />
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {step === 1 ? (
              /* ── Step 1: roles + quantity (home step 2, compact) ── */
              <View
                style={[styles.grid, { flexDirection: rowDir }]}
                onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
              >
                {CATEGORIES.map((cat) => {
                  const q = roleQuantity(cat.key);
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      testID={`role-tile-${cat.key}`}
                      style={[styles.tile, { width: tileWidth ?? '48%' }, q > 0 && styles.tileOn]}
                      onPress={() => { if (q === 0) setQuantity(cat.key, 1); }}
                      activeOpacity={0.85}
                    >
                      {cat.image ? (
                        <Image source={cat.image} style={styles.tileImage} contentFit="cover" cachePolicy="memory-disk" />
                      ) : null}
                      <Text style={styles.tileLabel} numberOfLines={1}>
                        {labelOf(ROLE_BY_ID[cat.roleId], lang)}
                      </Text>
                      {/* The strip is always there so picking a tile doesn't shift the grid */}
                      <View style={styles.tileControls}>
                        {q > 0 && (
                          <>
                            <TouchableOpacity
                              testID={`role-minus-${cat.key}`}
                              style={styles.controlMinus}
                              onPress={() => setQuantity(cat.key, q - 1)}
                              hitSlop={6}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.controlText}>−</Text>
                            </TouchableOpacity>
                            <Text testID={`role-count-${cat.key}`} style={styles.countText}>{q}</Text>
                            <TouchableOpacity
                              testID={`role-plus-${cat.key}`}
                              style={styles.controlPlus}
                              onPress={() => setQuantity(cat.key, q + 1)}
                              hitSlop={6}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.controlText}>+</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              /* ── Step 2: a subskill per slot (home step 3, compact) ── */
              <>
                <TouchableOpacity
                  style={[styles.backRow, { flexDirection: rowDir, alignSelf: rtl ? 'flex-end' : 'flex-start' }]}
                  onPress={() => setStep(1)}
                  hitSlop={8}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('project_details.add_pro_back')}
                >
                  <BackChevron size={18} color="#004aad" strokeWidth={2.5} />
                  <AppText weight="semiBold" style={styles.backText}>{t('project_details.add_pro_back')}</AppText>
                </TouchableOpacity>

                {chosenCategories.map((category) => {
                  const catDef = CATEGORIES.find((c) => c.key === category);
                  const roleId = catDef?.roleId ?? '';
                  const subskills = getSpecializations(roleId); // general first
                  const roleLabel = catDef ? labelOf(ROLE_BY_ID[catDef.roleId], lang) : category;
                  const caps = slotCaps(category);
                  return (
                    <View key={category} style={styles.roleCard}>
                      <View style={[styles.roleHeader, { flexDirection: rowDir }]}>
                        {CATEGORY_ICON[category] ? (
                          <Image source={CATEGORY_ICON[category]} style={styles.roleAvatar} contentFit="cover" cachePolicy="memory-disk" />
                        ) : null}
                        <View style={{ flex: 1 }}>
                          <AppText weight="bold" style={[styles.roleName, { textAlign }]}>{roleLabel}</AppText>
                          <AppText weight="regular" style={[styles.roleNeed, { textAlign }]}>
                            {t('project_details.add_pro_needed', { n: caps.length })}
                          </AppText>
                        </View>
                      </View>

                      {caps.map((current, i) => {
                        const selectedId = current ?? 'general';
                        return (
                          <View key={i} testID={`slot-row-${category}-${i}`} style={styles.slot}>
                            {caps.length > 1 && (
                              <AppText weight="regular" style={[styles.slotLabel, { textAlign }]}>
                                {`${roleLabel} ${i + 1}`}
                              </AppText>
                            )}
                            <View style={[styles.pillRow, { flexDirection: rowDir }]}>
                              {subskills.map((sp) => {
                                const on = selectedId === sp.id;
                                return (
                                  <TouchableOpacity
                                    key={sp.id}
                                    testID={`slot-pill-${category}-${i}-${sp.id}`}
                                    style={[styles.pill, on ? styles.pillOn : styles.pillOff]}
                                    onPress={() => setSlotCapability(category, i, sp.id === 'general' ? undefined : sp.id)}
                                    activeOpacity={0.7}
                                    accessibilityState={{ selected: on }}
                                  >
                                    <AppText weight="semiBold" style={on ? styles.pillTextOn : styles.pillTextOff}>
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
                  );
                })}
              </>
            )}
            <View style={{ height: 16 }} />
          </ScrollView>

          {step === 1 ? (
            <TouchableOpacity
              style={[styles.primaryBtn, totalCount === 0 && styles.primaryBtnDisabled]}
              onPress={() => setStep(2)}
              disabled={totalCount === 0}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('project_details.add_pro_continue')}
              accessibilityState={{ disabled: totalCount === 0 }}
            >
              <AppText weight="bold" style={styles.primaryBtnText}>{t('project_details.add_pro_continue')}</AppText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, (slots.length === 0 || isPosting) && styles.primaryBtnDisabled]}
              onPress={handlePost}
              disabled={slots.length === 0 || isPosting}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('project_details.post_roles')}
            >
              {isPosting
                ? <ActivityIndicator color="#fff" size="small" />
                : <AppText weight="bold" style={styles.primaryBtnText}>{t('project_details.post_roles')}</AppText>}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: SHEET_PADDING,
    paddingBottom: 28,
    maxHeight: '88%',
    flex: 1,
  },
  header: { alignItems: 'center', gap: 8 },
  title: { fontSize: 18, color: '#004aad' },
  stepRow: { alignItems: 'center', gap: 6, marginTop: 2 },
  stepLabel: { fontSize: 12, color: '#9aa0b8' },
  stepName: { fontSize: 12, color: '#004aad' },
  progressRow: { gap: 6, marginTop: 10, marginBottom: 12 },
  progressBar: { flex: 1, height: 4, borderRadius: 2 },
  progressOn: { backgroundColor: '#004aad' },
  progressOff: { backgroundColor: 'rgba(0,74,173,0.15)' },
  scroll: { flex: 1 },

  // Step 1 tiles (home step 2, smaller)
  grid: { flexWrap: 'wrap', gap: GAP },
  tile: {
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tileOn: { borderColor: ACCENT },
  tileImage: { width: '100%', height: 80 },
  tileLabel: { fontSize: 14, fontWeight: '700', color: '#004aad', textAlign: 'center', paddingHorizontal: 4, paddingVertical: 4 },
  tileControls: {
    width: '100%', height: 26, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  controlMinus: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(229,57,53,0.85)', alignItems: 'center', justifyContent: 'center' },
  controlPlus: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#004aad', alignItems: 'center', justifyContent: 'center' },
  controlText: { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 15 },
  countText: { color: '#004aad', fontSize: 13, fontWeight: '800', minWidth: 12, textAlign: 'center' },

  // Step 2 cards (home step 3, smaller)
  backRow: { alignItems: 'center', gap: 2, marginBottom: 8 },
  backText: { fontSize: 14, color: '#004aad' },
  roleCard: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,74,173,0.12)', padding: 12, marginBottom: 10 },
  roleHeader: { alignItems: 'center', gap: 10 },
  roleAvatar: { width: 48, height: 48, borderRadius: 24 },
  roleName: { fontSize: 15, color: '#2a2f5a' },
  roleNeed: { fontSize: 12, color: '#9aa0b8', marginTop: 1 },
  slot: { backgroundColor: '#faf9fe', borderRadius: 11, padding: 9, marginTop: 8, gap: 6 },
  slotLabel: { fontSize: 12, color: '#9aa0b8' },
  pillRow: { flexWrap: 'wrap', gap: 6 },
  pill: { borderRadius: 14, paddingHorizontal: 11, paddingVertical: 6 },
  pillOn: { backgroundColor: '#004aad' },
  pillOff: { backgroundColor: '#f0f0f7' },
  pillTextOn: { color: '#ffffff', fontSize: 12 },
  pillTextOff: { color: '#5c6180', fontSize: 12 },

  primaryBtn: { backgroundColor: '#004aad', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#ffffff', fontSize: 16 },
});

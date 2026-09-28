import { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { GradientBand } from '@components/ui/GradientBand';
import { PressableScale } from '@components/ui/PressableScale';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { RADIUS, SPACE, TEXT } from '@core/constants/surface';
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

/**
 * The home builder's palette (client home, steps 2 and 3). Copied rather than
 * imported: the builder keeps its tokens private to its screen.
 */
const WIZARD = {
  text: '#16132B',
  accent: '#5B3FE0',
  rowSelectedBg: '#F1EEFF',
  rowBorder: '#ECE9F5',
  tileBg: '#EFECFA',
  addBorder: '#DAD5EA',
  stepperMinusBg: '#E4DFF7',
  ctaDisabledBg: '#B9B3D1',
} as const;
const VIOLET = '#6D28D9';
const FIELD_FILL = '#F6F5FA';
const FIELD_BORDER = '#EAE8F0';
const HAIRLINE = '#F0EEF6';
const ROW_GAP = 10;

/**
 * "Add professional" on project details, in the client home builder's design:
 * the violet band with the title, progress bars and step label, then a white
 * sheet — step 1 is home step 2 (a row per role, − count + stepper), step 2 is
 * home step 3 (a card per role, a subskill per seat). Same selection state as
 * the home builder (useCrewBuilder) and the same role list (data/roleTiles), so
 * a slot posted from here is shaped exactly like one posted when the project
 * was created.
 */
export function RolePickerModal({ visible, onDismiss, onPost, isPosting = false }: Props) {
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';
  const font = useAppFont();

  const { slots, totalCount, roleQuantity, setQuantity, slotCaps, setSlotCapability, reset } = useCrewBuilder();
  const [step, setStep] = useState<1 | 2>(1);

  const rowDir = rtl ? 'row-reverse' : 'row';
  const textAlign = rtl ? 'right' : 'left';
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
  // The home title's type: 800 has no useAppFont entry, and a custom face ignores
  // fontWeight on iOS, so Hebrew names the ExtraBold face; Montserrat is variable.
  // No lineHeight in Hebrew: Heebo needs ~1.47em, and a tighter line cuts its tops.
  const titleType = rtl
    ? { fontFamily: 'Heebo-ExtraBold' }
    : { fontFamily: font.bold.fontFamily, fontWeight: '800' as const, lineHeight: 30 };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* ── The violet band: title, progress, step ── */}
          <GradientBand style={styles.band} flip>
            <View style={[styles.bandTop, { flexDirection: rowDir }]}>
              <Text style={[styles.title, titleType, { textAlign }]} numberOfLines={1}>
                {t('project_details.add_professional').replace(/^\+\s*/, '')}
              </Text>
              <TouchableOpacity
                onPress={handleDismiss}
                hitSlop={12}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('project_details.add_pro_close')}
              >
                <X size={22} color="#FFFFFF" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>
            <View style={[styles.progressRow, { flexDirection: rowDir }]}>
              <View style={[styles.progressBar, styles.progressDone]} />
              <View style={[styles.progressBar, step === 2 ? styles.progressDone : styles.progressTodo]} />
            </View>
            <View style={[styles.stepRow, { flexDirection: rowDir }]}>
              <Text style={[styles.stepLabel, { fontFamily: font.medium.fontFamily }]}>
                {t('project_details.add_pro_step_of', { n: step })}
              </Text>
              <Text style={[styles.stepLabel, styles.stepDot, { fontFamily: font.medium.fontFamily }]}>·</Text>
              <Text style={[styles.stepLabel, { fontFamily: font.semiBold.fontFamily }]}>
                {step === 1 ? t('project_details.add_pro_step_roles') : t('project_details.add_pro_step_subskills')}
              </Text>
            </View>
          </GradientBand>

          {/* ── The white sheet over the band's lower edge ── */}
          <View style={styles.sheet}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {step === 1 ? (
                /* ── Step 1: a row per role (home step 2) ── */
                <View style={styles.s2List}>
                  {CATEGORIES.map((cat, idx) => {
                    const q = roleQuantity(cat.key);
                    const label = labelOf(ROLE_BY_ID[cat.roleId], lang);
                    const on = q > 0;
                    return (
                      <PressableScale
                        key={cat.key}
                        testID={`role-tile-${cat.key}`}
                        style={[
                          styles.s2Row,
                          { flexDirection: rowDir, marginTop: idx === 0 ? 0 : ROW_GAP },
                          on && styles.s2RowOn,
                        ]}
                        // Empty, the whole row is the add target; seated, the stepper owns the count.
                        onPress={() => { if (q === 0) setQuantity(cat.key, 1); }}
                        haptic={q === 0 ? 'commit' : undefined}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                      >
                        <View style={[styles.s2Tile, on && styles.s2TileOn]}>
                          {cat.glyph ? (
                            <Image
                              source={cat.glyph}
                              style={styles.s2Glyph}
                              contentFit="contain"
                              cachePolicy="memory-disk"
                              tintColor={on ? '#FFFFFF' : WIZARD.accent}
                            />
                          ) : null}
                        </View>

                        <Text
                          style={[styles.s2RoleName, { fontFamily: font.bold.fontFamily, textAlign }]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {label}
                        </Text>

                        {on ? (
                          <View style={[styles.s2Stepper, { flexDirection: rowDir }]}>
                            <PressableScale
                              testID={`role-plus-${cat.key}`}
                              style={styles.s2StepAdd}
                              onPress={(e) => { e?.stopPropagation?.(); setQuantity(cat.key, q + 1); }}
                              hitSlop={10}
                              activeScale={0.88}
                              haptic="commit"
                              accessibilityRole="button"
                              accessibilityLabel={t('builder.add_role_a11y', { role: label })}
                            >
                              <Plus size={16} color="#FFFFFF" strokeWidth={3} />
                            </PressableScale>
                            <Text
                              testID={`role-count-${cat.key}`}
                              style={[styles.s2Count, { fontFamily: rtl ? 'Heebo-ExtraBold' : font.bold.fontFamily }]}
                            >
                              {q}
                            </Text>
                            <PressableScale
                              testID={`role-minus-${cat.key}`}
                              style={styles.s2StepRemove}
                              onPress={(e) => { e?.stopPropagation?.(); setQuantity(cat.key, q - 1); }}
                              hitSlop={10}
                              activeScale={0.88}
                              haptic="commit"
                              accessibilityRole="button"
                              accessibilityLabel={t('builder.remove_role_a11y', { role: label })}
                            >
                              <Minus size={16} color={WIZARD.accent} strokeWidth={3} />
                            </PressableScale>
                          </View>
                        ) : (
                          <PressableScale
                            style={styles.s2AddPill}
                            onPress={(e) => { e?.stopPropagation?.(); setQuantity(cat.key, 1); }}
                            activeScale={0.96}
                            haptic="commit"
                            accessibilityRole="button"
                            accessibilityLabel={t('builder.add_role_a11y', { role: label })}
                          >
                            <Text style={[styles.s2AddPillText, { fontFamily: font.semiBold.fontFamily }]}>
                              {t('builder.add_role')}
                            </Text>
                          </PressableScale>
                        )}
                      </PressableScale>
                    );
                  })}
                </View>
              ) : (
                /* ── Step 2: a subskill per seat (home step 3) ── */
                <>
                  <TouchableOpacity
                    style={[styles.backArrow, { flexDirection: rowDir, alignSelf: rtl ? 'flex-end' : 'flex-start' }]}
                    onPress={() => setStep(1)}
                    hitSlop={8}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('project_details.add_pro_back')}
                  >
                    <BackChevron size={20} color="#000000" strokeWidth={2.5} />
                    <Text style={[styles.backArrowText, { fontFamily: font.semiBold.fontFamily }]}>
                      {t('project_details.add_pro_back')}
                    </Text>
                  </TouchableOpacity>

                  {chosenCategories.map((category) => {
                    const catDef = CATEGORIES.find((c) => c.key === category);
                    const roleId = catDef?.roleId ?? '';
                    const subskills = getSpecializations(roleId); // general first
                    const roleLabel = catDef ? labelOf(ROLE_BY_ID[catDef.roleId], lang) : category;
                    const caps = slotCaps(category);
                    return (
                      <View key={category} style={styles.s3Card}>
                        <View style={[styles.s3Header, { flexDirection: rowDir }]}>
                          {CATEGORY_ICON[category] ? (
                            <Image
                              source={CATEGORY_ICON[category]}
                              style={styles.s3Avatar}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              tintColor={VIOLET}
                            />
                          ) : null}
                          <View style={{ flex: 1 }}>
                            <AppText weight="bold" style={[styles.s3RoleName, { textAlign }]}>
                              {roleLabel}
                              {/* One seat: its chosen subskill rides on the role name. */}
                              {caps.length === 1 ? (
                                <AppText weight="semiBold" style={styles.s3SelLabel}>
                                  {` - ${labelOf(subskills.find((s) => s.id === (caps[0] ?? 'general')) ?? subskills[0], lang)}`}
                                </AppText>
                              ) : null}
                            </AppText>
                            <AppText weight="regular" style={[styles.s3SlotLabel, { textAlign }]}>
                              {t('project_details.add_pro_needed', { n: caps.length })}
                            </AppText>
                          </View>
                        </View>

                        {caps.map((current, i) => {
                          const selectedId = current ?? 'general';
                          const selectedLabel = labelOf(subskills.find((s) => s.id === selectedId) ?? subskills[0], lang);
                          const multiple = caps.length > 1;
                          return (
                            <View key={i} testID={`slot-row-${category}-${i}`} style={styles.s3Slot}>
                              {i > 0 && <View style={styles.s3SeatDivider} />}
                              {multiple && (
                                <View style={[styles.s3SlotHead, { flexDirection: rowDir }]}>
                                  <View style={styles.s3Num}>
                                    <AppText weight="bold" style={styles.s3NumText}>{i + 1}</AppText>
                                  </View>
                                  <AppText weight="regular" style={styles.s3SlotLabel}>
                                    {`${roleLabel} ${i + 1}`}
                                    <AppText weight="semiBold" style={styles.s3SelLabel}>{` - ${selectedLabel}`}</AppText>
                                  </AppText>
                                </View>
                              )}
                              <View style={[styles.s3PillRow, { flexDirection: rowDir }]}>
                                {subskills.map((sp) => {
                                  const on = selectedId === sp.id;
                                  return (
                                    <PressableScale
                                      key={sp.id}
                                      testID={`slot-pill-${category}-${i}-${sp.id}`}
                                      style={[styles.s3Pill, on ? styles.s3PillSel : styles.s3PillUnsel]}
                                      onPress={() => setSlotCapability(category, i, sp.id === 'general' ? undefined : sp.id)}
                                      activeScale={0.94}
                                      haptic="tap"
                                      accessibilityState={{ selected: on }}
                                    >
                                      <AppText weight="semiBold" style={on ? styles.s3PillTextSel : styles.s3PillTextUnsel}>
                                        {labelOf(sp, lang)}
                                      </AppText>
                                    </PressableScale>
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
            </ScrollView>

            {/* ── The CTA ── */}
            {step === 1 ? (
              <View style={styles.ctaWrap}>
                <PressableScale
                  style={[styles.s2Cta, totalCount === 0 && styles.s2CtaOff]}
                  onPress={() => setStep(2)}
                  disabled={totalCount === 0}
                  activeScale={0.98}
                  accessibilityRole="button"
                  accessibilityLabel={t('project_details.add_pro_continue')}
                  accessibilityState={{ disabled: totalCount === 0 }}
                >
                  <Text style={[styles.s2CtaText, { fontFamily: font.bold.fontFamily }]}>
                    {totalCount === 0
                      ? t('builder.pick_at_least_one')
                      : totalCount === 1
                        ? t('builder.continue_with_count_one')
                        : t('builder.continue_with_count', { count: totalCount })}
                  </Text>
                </PressableScale>
              </View>
            ) : (
              <View style={[styles.ctaWrap, styles.submitWrap]}>
                <PressableScale
                  style={[styles.submitBtn, (slots.length === 0 || isPosting) && styles.submitBtnOff]}
                  onPress={handlePost}
                  disabled={slots.length === 0 || isPosting}
                  activeScale={0.98}
                  accessibilityRole="button"
                  accessibilityLabel={t('project_details.post_roles')}
                >
                  <LinearGradient colors={[VIOLET, VIOLET]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitFill}>
                    {isPosting
                      ? <ActivityIndicator color="#FFFFFF" size="small" />
                      : <Text style={[styles.submitText, { fontFamily: font.bold.fontFamily }]}>{t('project_details.post_roles')}</Text>}
                  </LinearGradient>
                </PressableScale>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  container: {
    maxHeight: '90%',
    flex: 1,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },

  // The band (home: band, progress, step label)
  band: { paddingTop: 22, paddingHorizontal: 20, paddingBottom: 30 },
  bandTop: { alignItems: 'center', gap: 12 },
  title: { flex: 1, color: '#FFFFFF', fontSize: 25, letterSpacing: -0.3 },
  progressRow: { gap: 6, marginTop: 16 },
  progressBar: { flex: 1, height: 4, borderRadius: 99 },
  progressDone: { backgroundColor: 'rgba(255,255,255,0.95)' },
  progressTodo: { backgroundColor: 'rgba(255,255,255,0.28)' },
  stepRow: { alignItems: 'center', gap: 5, marginTop: 8 },
  stepLabel: { fontSize: 11.5, fontWeight: '500', color: 'rgba(255,255,255,0.92)' },
  stepDot: { opacity: 0.7 },

  // The sheet (home: sheet)
  sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginTop: -22,
    paddingTop: 22,
    paddingHorizontal: 20,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },

  // Step 1 rows (home step 2)
  s2List: { marginTop: 2 },
  s2Row: {
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: WIZARD.rowBorder,
  },
  s2RowOn: { backgroundColor: WIZARD.rowSelectedBg, borderColor: WIZARD.accent },
  s2Tile: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: WIZARD.tileBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  s2TileOn: { backgroundColor: WIZARD.accent },
  s2Glyph: { width: 28, height: 28 },
  s2RoleName: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: '700', color: WIZARD.text },
  s2Stepper: {
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: WIZARD.addBorder,
    alignItems: 'center',
    paddingHorizontal: 3,
    gap: 10,
    flexShrink: 0,
  },
  s2StepAdd: { width: 30, height: 30, borderRadius: 15, backgroundColor: WIZARD.accent, alignItems: 'center', justifyContent: 'center' },
  s2StepRemove: { width: 30, height: 30, borderRadius: 15, backgroundColor: WIZARD.stepperMinusBg, alignItems: 'center', justifyContent: 'center' },
  s2Count: { fontSize: 16, fontWeight: '800', color: WIZARD.text, minWidth: 14, textAlign: 'center' },
  s2AddPill: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: WIZARD.addBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  s2AddPillText: { fontSize: 14, fontWeight: '600', color: WIZARD.text },

  // CTAs (home: s2Cta, submitBtn)
  ctaWrap: { backgroundColor: '#FFFFFF', paddingTop: 12, paddingBottom: 28 },
  s2Cta: { height: 56, borderRadius: 16, backgroundColor: WIZARD.accent, alignItems: 'center', justifyContent: 'center' },
  s2CtaOff: { backgroundColor: WIZARD.ctaDisabledBg },
  s2CtaText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  submitWrap: { borderTopWidth: 1, borderTopColor: HAIRLINE },
  submitBtn: {
    height: 52,
    borderRadius: 16,
    backgroundColor: VIOLET,
    shadowColor: '#3B19A0',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  submitBtnOff: { opacity: 0.5 },
  submitFill: { flex: 1, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#FFFFFF', fontSize: 16, lineHeight: 21, fontWeight: '700' },

  // Step 2 cards (home step 3)
  backArrow: { alignItems: 'center', gap: SPACE.xs, paddingVertical: 4 },
  backArrowText: { color: '#000000', fontSize: 15, fontWeight: '600' },
  s3Card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    borderRadius: RADIUS.md,
    padding: SPACE.lg,
    marginTop: SPACE.lg,
  },
  s3Header: { alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.xs },
  s3Avatar: { width: 64, height: 64, borderRadius: 32 },
  s3RoleName: { fontSize: 16, lineHeight: 24, color: TEXT.primary },
  s3SelLabel: { fontSize: 13, lineHeight: 20, color: TEXT.primary },
  s3Slot: { marginTop: SPACE.md, gap: SPACE.sm },
  s3SeatDivider: { height: 1, backgroundColor: FIELD_BORDER, marginBottom: SPACE.xs },
  s3SlotHead: { alignItems: 'center', gap: SPACE.sm },
  s3Num: { width: 22, height: 22, borderRadius: 11, backgroundColor: VIOLET, alignItems: 'center', justifyContent: 'center' },
  s3NumText: { fontSize: 12, color: '#FFFFFF' },
  s3SlotLabel: { fontSize: 12, lineHeight: 18, color: TEXT.secondary },
  s3PillRow: { flexWrap: 'wrap', gap: SPACE.sm },
  s3Pill: { borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  s3PillSel: { backgroundColor: VIOLET },
  s3PillUnsel: { backgroundColor: FIELD_FILL },
  s3PillTextSel: { color: '#FFFFFF', fontSize: 13, lineHeight: 20 },
  s3PillTextUnsel: { color: TEXT.primary, fontSize: 13, lineHeight: 20 },
});

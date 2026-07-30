import { useState, useEffect, useMemo } from 'react';
import {
  ScrollView, StyleSheet, View, Text, TextInput, TouchableOpacity, FlatList, Platform,
  useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { HelpTooltip } from '@components/ui/HelpTooltip';
import { useCrewBuilder } from '@features/crew/hooks';
import { MiniCalendar } from '@features/crew/components';
import { useTheme } from '@core/hooks/useTheme';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
import { getDocument } from '@core/firebase/firestore';
import { CalendarDays, ChevronLeft, X } from 'lucide-react-native';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { useGenerateTitle } from '@features/projects/hooks/useGenerateTitle';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ProjectRequest } from '@core/types/project';

const categoryImages = {
  videographer:    require('../../../../../assets/images/categories/videographer.png'),
  photographer:    require('../../../../../assets/images/categories/photographer.png'),
  editor:          require('../../../../../assets/images/categories/editor.png'),
  graphicDesigner: require('../../../../../assets/images/categories/graphic-designer.png'),
  ai:              require('../../../../../assets/images/categories/ai.png'),
  social:          require('../../../../../assets/images/categories/social.png'),
  studios:         require('../../../../../assets/images/categories/studios.png'),
  lighting:        require('../../../../../assets/images/categories/lighting.png'),
  sound:           require('../../../../../assets/images/categories/sound.png'),
};

const CATEGORY_META: Record<string, { labelKey: string; image: ReturnType<typeof require> }> = {
  'Video Photographer': { labelKey: 'builder.category_videographer', image: categoryImages.videographer },
  'Still Photographer': { labelKey: 'builder.category_photographer', image: categoryImages.photographer },
  'Editor':             { labelKey: 'builder.category_editor',        image: categoryImages.editor },
  'Graphic Designer':   { labelKey: 'builder.category_graphic_designer', image: categoryImages.graphicDesigner },
  'AI Specialist':      { labelKey: 'AI',                             image: categoryImages.ai },
  'Social Media':       { labelKey: 'builder.category_social',        image: categoryImages.social },
  'Studio & Audio':     { labelKey: 'builder.category_studios',       image: categoryImages.studios },
  'Lighting Tech':      { labelKey: 'builder.category_lighting',      image: categoryImages.lighting },
  'Sound Recordist':    { labelKey: 'builder.category_sound',         image: categoryImages.sound },
};

const CATEGORIES = Object.entries(CREW_CATEGORIES).map(([key, subs]) => ({
  key,
  labelKey: CATEGORY_META[key]?.labelKey ?? key,
  image: CATEGORY_META[key]?.image,
  subcategories: subs,
}));


const webInputShadow = { boxShadow: '0 0 14px #7b4fd422, 0 0 28px #004aad14' } as object;

export default function HomeScreen() {
  const { slots, totalCount, addSlot, removeSlot, loadSlots } = useCrewBuilder();
  const colors = useTheme();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const isEditMode = !!projectId;
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const { width } = useWindowDimensions();
  const tileSize = Math.floor((width - 64 - 32 - 12) / 3);

  const language = useSettingsStore((s) => s.language);
  const translations = language === 'he' ? he : en;
  const t = (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
  const getCategoryLabel = (labelKey: string) => labelKey === 'AI' ? 'AI' : t(labelKey);
  const rtl = language === 'he';

  const font = useAppFont();
  const styles = useMemo(
    () => createStyles(font.regular, font.bold, font.semiBold, font.medium),
    [font.regular, font.bold, font.semiBold, font.medium],
  );

  const { generateTitle, isGenerating } = useGenerateTitle();

  // ── Form state (single source of truth for all steps + summary) ──
  const [step, setStep] = useState<1 | 2>(1);
  const [description, setDescription] = useState('');
  const [exec, setExec] = useState('');
  const [deadline, setDeadline] = useState('');
  const [location, setLocation] = useState('');
  const [title, setTitle] = useState('');
  const [titleFailed, setTitleFailed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [calOpen, setCalOpen] = useState<'exec' | 'deadline' | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setIsLoadingProject(true);
    getDocument<ProjectRequest>(`projects/${projectId}`)
      .then((project) => {
        if (!project) return;
        setTitle(project.title ?? '');
        setDescription(project.description);
        setExec(project.exec ?? '');
        setDeadline(project.deadline ?? '');
        setLocation(project.location);
        loadSlots(project.crewSlots);
      })
      .finally(() => setIsLoadingProject(false));
  }, [projectId, loadSlots]);

  // ── Step 1 → Step 2 ──
  async function handleNext() {
    const next: Record<string, string> = {};
    if (!description.trim()) next.description = t('builder.error_required');
    if (!deadline) next.deadline = t('builder.error_required');
    if (!location.trim()) next.location = t('builder.error_required');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    if (!isEditMode) {
      try {
        const generated = await Promise.race([
          generateTitle(description),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 30_000)),
        ]);
        setTitle(generated);
        setTitleFailed(false);
      } catch {
        setTitle('');
        setTitleFailed(true);
      }
    }
    setStep(2);
  }

  // ── Step 2 → Summary screen ──
  function handleReview() {
    if (totalCount === 0) {
      setErrors({ slots: t('builder.error_role') });
      return;
    }
    setErrors({});
    router.push({
      pathname: '/(client)/(tabs)/home/summary' as never,
      params: {
        title,
        description,
        exec,
        deadline,
        location,
        projectId: (projectId as string) ?? '',
        titleFailed: titleFailed ? 'true' : 'false',
      },
    });
  }

  if (isLoadingProject) {
    return (
      <Screen scrollable={false}>
        <ActivityIndicator color={colors.accent} style={{ flex: 1, marginTop: 80 }} />
      </Screen>
    );
  }

  return (
    <Screen scrollable={false}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* ── Progress indicator ── */}
        <View style={styles.progressRow}>
          <View style={[styles.progressBar, { backgroundColor: '#004aad' }]} />
          <View style={[styles.progressBar, { backgroundColor: step === 2 ? '#004aad' : colors.border }]} />
        </View>

        {/* ══════════════ STEP 1: Project details ══════════════ */}
        {step === 1 && (
          <>
            <Text style={styles.pageTitle}>
              {rtl ? 'בנה את הפרויקט שלך' : 'Build Your Project'}
            </Text>

            <View style={styles.card}>
              <Text style={[styles.label, { color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}>{t('builder.tell_us')}</Text>
              <TextInput
                style={[styles.input, styles.multiline, { backgroundColor: '#ffffff', color: colors.text, textAlign: rtl ? 'right' : 'left' }, Platform.OS === 'web' && webInputShadow]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('builder.tell_us_placeholder')}
                placeholderTextColor="#004aad99"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              {errors.description ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.description}</Text> : null}

              {/* Labels row */}
              <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 12, alignItems: 'flex-start', marginTop: 16 }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[styles.label, { color: '#004aad', marginTop: 0, marginBottom: 0, textAlign: 'center' }]}>
                    {t('builder.execution')}
                  </Text>
                  <Text style={{ fontSize: 9, color: colors.textMuted, textAlign: 'center', fontFamily: font.regular }}>
                    ({t('builder.optional')})
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[styles.label, { color: '#004aad', marginTop: 0, marginBottom: 0, textAlign: 'center' }]}>
                    {t('builder.deadline')}
                  </Text>
                </View>
              </View>

              {/* Date squares row */}
              <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 12, alignItems: 'flex-start', marginTop: 8 }}>
                {/* Execution square */}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <TouchableOpacity style={styles.dateSquare} onPress={() => setCalOpen('exec')} activeOpacity={0.8}>
                    <View style={{ position: 'absolute', top: 6, left: 6 }}>
                      <HelpTooltip text={t('builder.help_execution')} />
                    </View>
                    {exec ? (
                      <TouchableOpacity
                        style={styles.dateSquareClear}
                        onPress={(e) => { e.stopPropagation?.(); setExec(''); }}
                        hitSlop={8}
                        activeOpacity={0.7}
                      >
                        <X size={12} color="#fff" strokeWidth={2.5} />
                      </TouchableOpacity>
                    ) : null}
                    <CalendarDays size={exec ? 20 : 28} color="#004aad" strokeWidth={1.8} />
                    <Text style={exec ? styles.dateSquareValue : styles.dateSquarePlaceholder} numberOfLines={2}>
                      {exec || t('builder.placeholder_date')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Deadline square */}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[styles.dateSquare, errors.deadline ? { borderWidth: 1.5, borderColor: '#fc8181' } : null]}
                    onPress={() => setCalOpen('deadline')}
                    activeOpacity={0.8}
                  >
                    <View style={{ position: 'absolute', top: 6, left: 6 }}>
                      <HelpTooltip text={t('builder.help_deadline')} />
                    </View>
                    {deadline ? (
                      <TouchableOpacity
                        style={styles.dateSquareClear}
                        onPress={(e) => { e.stopPropagation?.(); setDeadline(''); }}
                        hitSlop={8}
                        activeOpacity={0.7}
                      >
                        <X size={12} color="#fff" strokeWidth={2.5} />
                      </TouchableOpacity>
                    ) : null}
                    <CalendarDays size={deadline ? 20 : 28} color="#004aad" strokeWidth={1.8} />
                    <Text style={deadline ? styles.dateSquareValue : styles.dateSquarePlaceholder} numberOfLines={2}>
                      {deadline || t('builder.placeholder_deadline')}
                    </Text>
                  </TouchableOpacity>
                  {errors.deadline ? <Text style={[styles.error, { textAlign: 'center' }]}>{errors.deadline}</Text> : null}
                </View>
              </View>

              {/* Location — plain TextInput, no overlay */}
              <Text style={[styles.label, { color: '#004aad', marginTop: 16, textAlign: rtl ? 'right' : 'left' }]}>
                {t('builder.location')}
              </Text>
              <TextInput
                style={[
                  styles.locationInput,
                  { color: '#004aad', textAlign: rtl ? 'right' : 'left' },
                  errors.location ? { borderColor: '#fc8181', borderWidth: 1.5 } : null,
                ]}
                value={location}
                onChangeText={setLocation}
                placeholder={t('builder.placeholder_location')}
                placeholderTextColor="#004aad99"
                returnKeyType="done"
              />
              {errors.location ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.location}</Text> : null}
            </View>

            <View style={[styles.submitWrap, { paddingHorizontal: 36, marginBottom: 90 }]}>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { alignSelf: 'stretch' },
                  isGenerating && styles.disabled,
                  Platform.OS === 'web' && ({ background: isGenerating ? '#004aad' : 'linear-gradient(to right, #004aad, #cb6ce6)' } as object),
                ]}
                onPress={() => void handleNext()}
                disabled={isGenerating}
                activeOpacity={0.8}
              >
                <Text style={styles.submitText}>
                  {isGenerating ? t('builder.generating_title') : t('builder.next_step')}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ══════════════ STEP 2: Select roles ══════════════ */}
        {step === 2 && (
          <>
            <TouchableOpacity style={styles.backArrow} onPress={() => setStep(1)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <ChevronLeft size={20} color="#004aad" strokeWidth={2.5} />
              <Text style={styles.backArrowText}>{t('search.back').replace('← ', '')}</Text>
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { color: '#004aad', textAlign: 'center', marginTop: 8, textTransform: 'uppercase' }]}>
              {t('builder.select_roles')}
            </Text>

            <View style={styles.rolesCard}>
              {errors.slots ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left', marginBottom: 8 }]}>{errors.slots}</Text> : null}

              <FlatList
                data={CATEGORIES}
                numColumns={3}
                scrollEnabled={false}
                keyExtractor={(cat) => cat.key}
                initialNumToRender={9}
                maxToRenderPerBatch={9}
                windowSize={3}
                columnWrapperStyle={{ gap: 6 }}
                ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
                renderItem={({ item: cat }) => {
                  const catTotal = slots
                    .filter(s => s.category === cat.key)
                    .reduce((sum, s) => sum + s.quantity, 0);
                  const isSelected = expandedCategory === cat.key;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.tile,
                        { width: tileSize, height: tileSize },
                        isSelected && { borderWidth: 2, borderColor: colors.accent },
                      ]}
                      onPress={() => setExpandedCategory(isSelected ? null : cat.key)}
                      activeOpacity={0.85}
                    >
                      {cat.image ? (
                        <Image source={cat.image} style={styles.tileImage} contentFit="contain" cachePolicy="memory-disk" />
                      ) : null}
                      <View style={styles.tileOverlay}>
                        <Text style={styles.tileLabel} numberOfLines={1}>{getCategoryLabel(cat.labelKey)}</Text>
                      </View>
                      {catTotal > 0 && (
                        <View style={[styles.tileBadge, { backgroundColor: colors.accent }]}>
                          <Text style={styles.tileBadgeText}>{catTotal}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />

              {/* ── Inline subcategory panel ── */}
              {expandedCategory !== null && (() => {
                const cat = CATEGORIES.find(c => c.key === expandedCategory);
                if (!cat) return null;
                return (
                  <View style={[styles.subcatPanel, { borderColor: colors.accent }]}>
                    <View style={styles.panelHeader}>
                      <Text style={[styles.panelTitle, { color: colors.text }]}>
                        {getCategoryLabel(cat.labelKey)}
                      </Text>
                      <TouchableOpacity onPress={() => setExpandedCategory(null)} hitSlop={12} activeOpacity={0.7}>
                        <Text style={[styles.closeBtn, { color: colors.textMuted }]}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={[styles.panelDivider, { backgroundColor: colors.accent }]} />
                    <Text style={[styles.subHint, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                      {t('builder.tap_to_add')}
                    </Text>
                    {cat.subcategories.map((sub) => {
                      const qty = slots.find(s => s.category === cat.key && s.subcategory === sub)?.quantity ?? 0;
                      return (
                        <View key={sub} style={[styles.subRow, { borderBottomColor: colors.borderMuted }]}>
                          <Text style={[styles.subLabel, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>{sub}</Text>
                          <View style={styles.qtyControls}>
                            {qty > 0 && (
                              <TouchableOpacity
                                style={[styles.qtyBtn, { borderColor: colors.inputBorder }]}
                                onPress={() => removeSlot(cat.key, sub)}
                                hitSlop={8}
                                activeOpacity={0.7}
                              >
                                <Text style={[styles.qtyBtnText, { color: colors.textMuted }]}>−</Text>
                              </TouchableOpacity>
                            )}
                            {qty > 0 && (
                              <View style={[styles.qtyBadge, { backgroundColor: colors.accent }]}>
                                <Text style={styles.qtyBadgeText}>{qty}</Text>
                              </View>
                            )}
                            <TouchableOpacity
                              style={[styles.qtyBtn, { borderColor: colors.accent, backgroundColor: colors.accent + '22' }]}
                              onPress={() => addSlot(cat.key, sub)}
                              hitSlop={8}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.qtyBtnText, { color: colors.accent }]}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}
            </View>

            <View style={styles.submitWrap}>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  Platform.OS === 'web' && ({ background: 'linear-gradient(to right, #004aad, #cb6ce6)' } as object),
                ]}
                onPress={handleReview}
                activeOpacity={0.8}
              >
                <Text style={styles.submitText}>
                  {isEditMode ? t('builder.save_changes') : t('builder.review')}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>



      {calOpen !== null && (
        <MiniCalendar
          value={calOpen === 'exec' ? exec : deadline}
          onSelect={(d) => {
            if (calOpen === 'exec') setExec(d);
            else setDeadline(d);
            setCalOpen(null);
          }}
          onClose={() => setCalOpen(null)}
        />
      )}
    </Screen>
  );
}

function createStyles(
  ff: string,
  ffBold: string,
  ffSemiBold: string,
  ffMedium: string,
) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 100 },
    pageTitle: { fontSize: 36, fontWeight: '800', fontFamily: ffBold, color: '#ffffff', textShadowColor: '#004aad', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 1, textAlign: 'center', textTransform: 'uppercase', marginTop: 20 },

    progressRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 16, marginBottom: 4 },
    progressBar: { flex: 1, height: 4, borderRadius: 2 },

    backArrow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, alignSelf: 'flex-start' },
    backArrowText: { color: '#004aad', fontSize: 15, fontWeight: '600', fontFamily: ffSemiBold },

    card: { margin: 16, marginTop: 24, padding: 20 },
    rolesCard: { marginHorizontal: 16, marginTop: 8, padding: 16 },
    sectionTitle: { fontSize: 20, fontWeight: '800', fontFamily: ffBold, marginBottom: 12 },
    label: { fontSize: 18, fontWeight: '600', fontFamily: ffSemiBold, marginTop: 16, marginBottom: 6 },
    input: { borderWidth: 0, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, fontFamily: ff },
    multiline: { height: 100 },
    error: { fontSize: 12, color: '#fc8181', marginTop: 4, fontFamily: ff },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tile: { borderRadius: 12, overflow: 'hidden', position: 'relative' },
    tileImage: { width: '100%', height: '100%', position: 'absolute' },
    tileOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 4, paddingHorizontal: 5 },
    tileLabel: { fontSize: 17, fontWeight: '700', fontFamily: ffBold, color: '#004aad', textAlign: 'center', textShadowColor: 'rgba(255,255,255,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
    tileBadge: { position: 'absolute', top: 5, right: 5, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    tileBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', fontFamily: ffBold },
    submitWrap: { padding: 16, paddingBottom: 32 },
    submitBtn: { backgroundColor: '#004aad', borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
    disabled: { backgroundColor: '#555' },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: ffBold },
    cancelBtn: { alignItems: 'center', paddingVertical: 12 },
    cancelText: { fontSize: 15, fontFamily: ff },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    panel: { width: '100%', maxHeight: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 2, overflow: 'hidden' },
    subcatPanel: { marginTop: 12, borderWidth: 2, borderRadius: 16, overflow: 'hidden' },
    panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
    panelTitle: { fontSize: 20, fontWeight: '800', fontFamily: ffBold },
    closeBtn: { fontSize: 18, fontWeight: '600', fontFamily: ffSemiBold },
    panelDivider: { height: 2, marginHorizontal: 20, borderRadius: 1, marginBottom: 4 },
    panelScroll: { maxHeight: 400 },
    subHint: { fontSize: 12, fontWeight: '600', fontFamily: ffSemiBold, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 20, paddingVertical: 12 },
    subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1 },
    subLabel: { fontSize: 15, fontWeight: '500', fontFamily: ffMedium, flex: 1 },
    qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    qtyBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    qtyBtnText: { fontSize: 16, lineHeight: 18, fontWeight: '700', fontFamily: ffBold },
    qtyBadge: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    qtyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800', fontFamily: ffBold },
    dateRow: { flexDirection: 'row', gap: 16, marginTop: 0 },
    dateCol: { flex: 1 },
    dateSquare: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      width: '100%',
      maxWidth: 120,
      height: 100,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
      padding: 8,
    },
    dateSquarePlaceholder: {
      fontSize: 11,
      color: '#004aad66',
      textAlign: 'center',
      fontFamily: ff,
    },
    dateSquareValue: {
      fontSize: 13,
      fontWeight: 'bold',
      color: '#004aad',
      textAlign: 'center',
      fontFamily: ffBold,
    },
    dateSquareClear: {
      position: 'absolute',
      top: 6,
      right: 6,
      backgroundColor: '#004aad',
      borderRadius: 10,
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Summary modal
    summaryCard: { width: '100%', maxHeight: '90%', borderRadius: 24, overflow: 'hidden' },
    summaryGradient: { flex: 1, borderRadius: 24 },
    summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
    summaryTitle: { fontSize: 22, fontWeight: '800', fontFamily: ffBold, color: '#004aad', flex: 1 },
    summaryScroll: { paddingHorizontal: 20, paddingBottom: 24 },
    summaryFieldLabel: { fontSize: 13, fontWeight: '700', fontFamily: ffSemiBold, color: '#004aad', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
    summaryInput: {
      backgroundColor: 'rgba(255,255,255,0.7)',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      fontFamily: ff,
      color: '#004aad',
    },
    summaryMultiline: { height: 80, textAlignVertical: 'top' },
    summaryHint: { fontSize: 12, color: '#004aad', fontFamily: ff, marginTop: 4, opacity: 0.8 },
    summaryDateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(255,255,255,0.7)',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 6,
    },
    summaryDateText: { fontSize: 13, flex: 1, fontFamily: ff },
    summarySlotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,74,173,0.1)',
    },
    summarySlotInfo: { flex: 1 },
    summarySlotSub: { fontSize: 14, fontWeight: '600', fontFamily: ffSemiBold, color: '#004aad' },
    summarySlotCat: { fontSize: 12, color: '#004aad', fontFamily: ff, marginTop: 1 },
    removeSlotBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

    locationInput: {
      backgroundColor: '#ffffff',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: ff,
      marginTop: 6,
    },
  });
}

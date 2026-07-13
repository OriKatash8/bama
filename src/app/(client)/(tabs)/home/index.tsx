import { useState, useRef, useEffect, useMemo } from 'react';
import { MotiView } from 'moti';
import {
  ScrollView, StyleSheet, View, Text, TextInput, TouchableOpacity, Platform,
  Image, useWindowDimensions, Modal, Animated, TouchableWithoutFeedback, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { useCrewBuilder, useProjectRequests } from '@features/crew/hooks';
import { MiniCalendar } from '@features/crew/components';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
import { getDocument } from '@core/firebase/firestore';
import { Calendar } from 'lucide-react-native';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { useGenerateTitle } from '@features/projects/hooks/useGenerateTitle';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ProjectRequest } from '@core/types/project';

const CATEGORY_META: Record<string, { labelKey: string; image: ReturnType<typeof require> }> = {
  'Video Photographer': { labelKey: 'builder.category_videographer', image: require('../../../../../assets/images/categories/videographer.png') },
  'Still Photographer': { labelKey: 'builder.category_photographer', image: require('../../../../../assets/images/categories/photographer.png') },
  'Editor':             { labelKey: 'builder.category_editor',        image: require('../../../../../assets/images/categories/editor.png') },
  'Graphic Designer':   { labelKey: 'builder.category_graphic_designer', image: require('../../../../../assets/images/categories/graphic-designer.png') },
  'AI Specialist':      { labelKey: 'AI',                             image: require('../../../../../assets/images/categories/ai.png') },
  'Social Media':       { labelKey: 'builder.category_social',        image: require('../../../../../assets/images/categories/social.png') },
  'Studio & Audio':     { labelKey: 'builder.category_studios',       image: require('../../../../../assets/images/categories/studios.png') },
  'Lighting Tech':      { labelKey: 'builder.category_lighting',      image: require('../../../../../assets/images/categories/lighting.png') },
  'Sound Recordist':    { labelKey: 'builder.category_sound',         image: require('../../../../../assets/images/categories/sound.png') },
};

const CATEGORIES = Object.entries(CREW_CATEGORIES).map(([key, subs]) => ({
  key,
  labelKey: CATEGORY_META[key]?.labelKey ?? key,
  image: CATEGORY_META[key]?.image,
  subcategories: subs,
}));

const webInputShadow = { boxShadow: '0 0 14px #7b4fd422, 0 0 28px #004aad14' } as object;

const gradientStyle = {
  background: 'linear-gradient(to right, #004aad, #cb6ce6)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
} as object;

export default function HomeScreen() {
  const { slots, totalCount, addSlot, removeSlot, reset: resetSlots, loadSlots } = useCrewBuilder();
  const { submit, updateProject } = useProjectRequests();
  const { showToast } = useUiStore();
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

  const [description, setDescription] = useState('');
  const [exec, setExec] = useState('');
  const [deadline, setDeadline] = useState('');
  const [location, setLocation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calOpen, setCalOpen] = useState<'exec' | 'deadline' | null>(null);

  // Title confirmation modal state
  const [titleModalVisible, setTitleModalVisible] = useState(false);
  const [pendingTitle, setPendingTitle] = useState('');
  const [titleFailed, setTitleFailed] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setIsLoadingProject(true);
    getDocument<ProjectRequest>(`projects/${projectId}`)
      .then((project) => {
        if (!project) return;
        setDescription(project.description);
        setExec(project.exec ?? '');
        setDeadline(project.deadline ?? '');
        setLocation(project.location);
        loadSlots(project.crewSlots);
      })
      .finally(() => setIsLoadingProject(false));
  }, [projectId, loadSlots]);

  const [selectedCategory, setSelectedCategory] = useState<typeof CATEGORIES[number] | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  function openCategory(cat: typeof CATEGORIES[number]) {
    setSelectedCategory(cat);
    setModalVisible(true);
    scaleAnim.setValue(0.3);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }

  function closeModal() {
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.3, duration: 150, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setModalVisible(false);
      setSelectedCategory(null);
    });
  }

  function getQty(sub: string) {
    return slots.find(s => s.category === selectedCategory?.key && s.subcategory === sub)?.quantity ?? 0;
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (totalCount === 0) next.slots = t('builder.error_role');
    if (!description.trim()) next.description = t('builder.error_required');
    if (!deadline) next.deadline = t('builder.error_required');
    if (!location.trim()) next.location = t('builder.error_required');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    try {
      const generated = await generateTitle(description);
      setPendingTitle(generated);
      setTitleFailed(false);
    } catch {
      setPendingTitle('');
      setTitleFailed(true);
    }
    setTitleModalVisible(true);
  }

  async function doSubmit(title: string) {
    setIsSubmitting(true);
    try {
      if (isEditMode && projectId) {
        await updateProject(projectId as string, slots, { title, description, exec, deadline, location });
        showToast(t('builder.project_updated'), 'success');
        setTitleModalVisible(false);
        resetSlots();
        setDescription('');
        setExec(''); setDeadline('');
        setLocation('');
        setErrors({});
        router.navigate('/(client)/(tabs)/chats' as never);
      } else {
        await submit(slots, { title, description, exec, deadline, location });
        setTitleModalVisible(false);
        resetSlots();
        setDescription('');
        setExec(''); setDeadline('');
        setLocation('');
        setErrors({});
        showToast(t('builder.request_submitted'), 'success');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : undefined;
      showToast(msg ?? (isEditMode ? t('builder.failed_update') : t('builder.failed_submit')), 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingProject) {
    return (
      <Screen scrollable={false}>
        <ActivityIndicator color={colors.accent} style={{ flex: 1, marginTop: 80 }} />
      </Screen>
    );
  }

  const isBusy = isGenerating || isSubmitting;

  return (
    <Screen scrollable={false}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.pageTitle, Platform.OS === 'web' && gradientStyle, Platform.OS !== 'web' && { color: colors.accent }]}>
          {t('builder.page_title')}
        </Text>

        <Text style={[styles.sectionTitle, { color: '#ffffff', textAlign: 'center', marginTop: 20, textTransform: 'uppercase', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }, Platform.OS === 'web' && { textShadow: '0 2px 8px rgba(0,0,0,0.4)' } as object]}>{t('builder.project_details')}</Text>

        <View style={styles.card}>
          <Text style={[styles.label, { color: '#7b2fa8', textAlign: rtl ? 'right' : 'left' }]}>{t('builder.tell_us')}</Text>
          <TextInput
            style={[styles.input, styles.multiline, { backgroundColor: '#ffffff', color: colors.text, textAlign: rtl ? 'right' : 'left' }, Platform.OS === 'web' && webInputShadow]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('builder.tell_us_placeholder')}
            placeholderTextColor="#7b2fa899"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          {errors.description ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.description}</Text> : null}

          <View style={styles.dateRow}>
            <View style={styles.dateCol}>
              <Text style={[styles.label, { color: '#7b2fa8', marginTop: 0, textAlign: rtl ? 'right' : 'left' }]}>{t('builder.execution')} <Text style={{ fontWeight: '400', color: '#7b2fa899' }}>({t('builder.optional')})</Text></Text>
              <TouchableOpacity
                style={[styles.dateBtn, { backgroundColor: '#ffffff' }, errors.exec && { borderWidth: 1, borderColor: '#fc8181' }, Platform.OS === 'web' && webInputShadow]}
                onPress={() => setCalOpen('exec')}
                activeOpacity={0.8}
              >
                <Text style={[styles.dateBtnText, { color: exec ? colors.text : '#7b2fa899', textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>{exec || t('builder.placeholder_date')}</Text>
                <Calendar size={14} color="#cb6ce6" strokeWidth={1.8} />
              </TouchableOpacity>
              {errors.exec ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.exec}</Text> : null}
            </View>

            <View style={styles.dateCol}>
              <Text style={[styles.label, { color: '#7b2fa8', marginTop: 0, textAlign: rtl ? 'right' : 'left' }]}>{t('builder.deadline')}</Text>
              <TouchableOpacity
                style={[styles.dateBtn, { backgroundColor: '#ffffff' }, errors.deadline && { borderWidth: 1, borderColor: '#fc8181' }, Platform.OS === 'web' && webInputShadow]}
                onPress={() => setCalOpen('deadline')}
                activeOpacity={0.8}
              >
                <Text style={[styles.dateBtnText, { color: deadline ? colors.text : '#7b2fa899', textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>{deadline || t('builder.placeholder_deadline')}</Text>
                <Calendar size={14} color="#cb6ce6" strokeWidth={1.8} />
              </TouchableOpacity>
              {errors.deadline ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.deadline}</Text> : null}
            </View>
          </View>

          <Text style={[styles.label, { color: '#7b2fa8', textAlign: rtl ? 'right' : 'left' }]}>{t('builder.location')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: '#ffffff', color: colors.text, textAlign: rtl ? 'right' : 'left' }, Platform.OS === 'web' && webInputShadow]}
            value={location}
            onChangeText={setLocation}
            placeholder={t('builder.placeholder_location')}
            placeholderTextColor="#7b2fa899"
          />
          {errors.location ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.location}</Text> : null}
        </View>

        <Text style={[styles.sectionTitle, { color: '#ffffff', textAlign: 'center', marginTop: 20, textTransform: 'uppercase', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }, Platform.OS === 'web' && { textShadow: '0 2px 8px rgba(0,0,0,0.4)' } as object]}>{t('builder.select_roles')}</Text>

        <View style={styles.rolesCard}>
          {errors.slots ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.slots}</Text> : null}

          <View style={styles.grid}>
            {CATEGORIES.map((cat, index) => {
              const catTotal = slots
                .filter(s => s.category === cat.key)
                .reduce((sum, s) => sum + s.quantity, 0);
              return (
                <MotiView
                  key={cat.key}
                  from={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'timing', duration: 300, delay: index * 50 }}
                >
                  <TouchableOpacity
                    style={[styles.tile, { width: tileSize, height: tileSize }]}
                    onPress={() => openCategory(cat)}
                    activeOpacity={0.85}
                  >
                    {cat.image ? (
                      <Image source={cat.image} style={styles.tileImage} resizeMode="cover" />
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
                </MotiView>
              );
            })}
          </View>
        </View>

        <View style={styles.submitWrap}>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              isBusy && styles.disabled,
              Platform.OS === 'web' && ({ background: isBusy ? '#004aad' : 'linear-gradient(to right, #004aad, #cb6ce6)' } as object),
            ]}
            onPress={handleSubmit}
            disabled={isBusy}
            activeOpacity={0.8}
          >
            <Text style={styles.submitText}>
              {isGenerating
                ? t('builder.generating_title')
                : isEditMode
                  ? t('builder.save_changes')
                  : `${t('builder.submit_request')}${totalCount > 0 ? ` (${totalCount} ${totalCount === 1 ? t('builder.role') : t('builder.roles')})` : ''}`}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Category picker modal */}
      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={closeModal}>
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.panel,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.accent,
                    transform: [{ scale: scaleAnim }],
                    opacity: opacityAnim,
                  },
                  Platform.OS === 'web' && ({ boxShadow: '0 0 48px #7b4fd488' } as object),
                ]}
              >
                <View style={styles.panelHeader}>
                  <Text style={[styles.panelTitle, { color: colors.text }]}>
                    {selectedCategory ? getCategoryLabel(selectedCategory.labelKey) : ''}
                  </Text>
                  <TouchableOpacity onPress={closeModal} hitSlop={12} activeOpacity={0.7}>
                    <Text style={[styles.closeBtn, { color: colors.textMuted }]}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.panelDivider, { backgroundColor: colors.accent }]} />

                <ScrollView showsVerticalScrollIndicator={false} style={styles.panelScroll}>
                  <Text style={[styles.subHint, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>{t('builder.tap_to_add')}</Text>
                  {selectedCategory?.subcategories.map((sub) => {
                    const qty = getQty(sub);
                    return (
                      <View key={sub} style={[styles.subRow, { borderBottomColor: colors.borderMuted }]}>
                        <Text style={[styles.subLabel, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>{sub}</Text>
                        <View style={styles.qtyControls}>
                          {qty > 0 && (
                            <TouchableOpacity
                              style={[styles.qtyBtn, { borderColor: colors.inputBorder }]}
                              onPress={() => removeSlot(selectedCategory.key, sub)}
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
                            onPress={() => addSlot(selectedCategory.key, sub)}
                            hitSlop={8}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.qtyBtnText, { color: colors.accent }]}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Title confirmation modal */}
      <Modal visible={titleModalVisible} transparent animationType="fade" onRequestClose={() => setTitleModalVisible(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.titleModal, { backgroundColor: colors.card, borderColor: colors.accent }, Platform.OS === 'web' && ({ boxShadow: '0 0 48px #7b4fd488' } as object)]}>
            <Text style={[styles.titleModalHeading, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
              {t('builder.confirm_title')}
            </Text>
            <Text style={[styles.titleModalHint, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
              {titleFailed ? t('builder.title_failed') : t('builder.confirm_title_hint')}
            </Text>
            <TextInput
              style={[styles.titleInput, { backgroundColor: '#ffffff', color: colors.text, textAlign: rtl ? 'right' : 'left' }, Platform.OS === 'web' && webInputShadow]}
              value={pendingTitle}
              onChangeText={setPendingTitle}
              placeholder={t('builder.confirm_title')}
              placeholderTextColor="#7b2fa899"
              autoFocus
            />
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!pendingTitle.trim() || isSubmitting) && styles.disabled,
                Platform.OS === 'web' && ({ background: (!pendingTitle.trim() || isSubmitting) ? '#004aad' : 'linear-gradient(to right, #004aad, #cb6ce6)' } as object),
                { marginTop: 16 },
              ]}
              onPress={() => doSubmit(pendingTitle.trim())}
              disabled={!pendingTitle.trim() || isSubmitting}
              activeOpacity={0.8}
            >
              <Text style={styles.submitText}>
                {isSubmitting ? t('builder.submitting') : t('builder.looks_good')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setTitleModalVisible(false)}
              disabled={isSubmitting}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelText, { color: colors.textMuted }]}>{t('project_details.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
    pageTitle: { fontSize: 36, fontWeight: '800', fontFamily: ffBold, marginTop: 24, marginHorizontal: 16, textAlign: 'center', textTransform: 'uppercase' },
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
    panel: { width: '100%', maxHeight: '80%', borderRadius: 24, borderWidth: 2, overflow: 'hidden' },
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
    dateRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
    dateCol: { flex: 1 },
    dateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 0,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginTop: 6,
    },
    dateBtnText: { fontSize: 13, flex: 1, fontFamily: ff },
    titleModal: { width: '100%', borderRadius: 24, borderWidth: 2, padding: 24 },
    titleModalHeading: { fontSize: 20, fontWeight: '700', fontFamily: ffBold, marginBottom: 8 },
    titleModalHint: { fontSize: 14, fontFamily: ff, marginBottom: 12 },
    titleInput: { borderWidth: 0, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, fontFamily: ff },
  });
}

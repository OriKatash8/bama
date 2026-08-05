import { useState, useRef, useEffect } from 'react';
import {
  ScrollView, FlatList, StyleSheet, View, Text, TextInput, TouchableOpacity, Platform,
  useWindowDimensions, Modal, Animated, TouchableWithoutFeedback, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';

const BAMA_LOGO = require('../../../../../assets/images/bama-logo.png');
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { useCrewBuilder, useProjectRequests } from '@features/crew/hooks';
import { MiniCalendar } from '@features/crew/components';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useAuth } from '@core/hooks/useAuth';
import { useSettingsStore } from '@core/stores/settingsStore';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
import { getDocument } from '@core/firebase/firestore';
import { Calendar } from 'lucide-react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ProjectRequest } from '@core/types/project';

const CATEGORY_META: Record<string, { labelKey: string; image: ReturnType<typeof require>; contain?: boolean }> = {
  'Video Photographer': { labelKey: 'builder.category_videographer', image: require('../../../../../assets/images/categories/videographer.png') },
  'Still Photographer': { labelKey: 'builder.category_photographer', image: require('../../../../../assets/images/categories/photographer.png') },
  'Editor':             { labelKey: 'builder.category_editor',        image: require('../../../../../assets/images/categories/editor.png') },
  'Graphic Designer':   { labelKey: 'builder.category_graphic_designer', image: require('../../../../../assets/images/categories/graphic-designer.png') },
  'Social Media':       { labelKey: 'builder.category_social',        image: require('../../../../../assets/images/categories/social.png') },
  'Studio & Audio':     { labelKey: 'builder.category_studios',       image: require('../../../../../assets/images/categories/studios.png') },
  'Lighting Tech':      { labelKey: 'builder.category_lighting',      image: require('../../../../../assets/images/categories/lighting-tech.png'), contain: true },
  'Sound Recordist':    { labelKey: 'builder.category_sound',         image: require('../../../../../assets/images/categories/sound.png') },
};

const CATEGORIES = Object.entries(CREW_CATEGORIES).map(([key, subs]) => ({
  key,
  labelKey: CATEGORY_META[key]?.labelKey ?? key,
  image: CATEGORY_META[key]?.image,
  contain: CATEGORY_META[key]?.contain,
  subcategories: subs,
}));

const gradientStyle = {
  background: 'linear-gradient(to right, #004aad, #cb6ce6)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
} as object;

export default function BuilderScreen() {
  const { slots, totalCount, addSlot, removeSlot, loadSlots } = useCrewBuilder();
  const { submit, updateProject } = useProjectRequests();
  const { showToast } = useUiStore();
  const colors = useTheme();
  const { user } = useAuth();
  const language = useSettingsStore((s) => s.language);
  const font = useAppFont();
  const translations = language === 'he' ? he : en;
  const t = (key: string, vars?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    let str = typeof result === 'string' ? result : key;
    if (vars) str = str.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
    return str;
  };
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const isEditMode = !!projectId;
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const { width } = useWindowDimensions();
  const tileSize = Math.floor((width - 64 - 32 - 12) / 3);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [exec, setExec] = useState('');
  const [deadline, setDeadline] = useState('');
  const [location, setLocation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calOpen, setCalOpen] = useState<'exec' | 'deadline' | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setIsLoadingProject(true);
    getDocument<ProjectRequest>(`projects/${projectId}`)
      .then((project) => {
        if (!project) return;
        setTitle(project.title);
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

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 12) return t('builder.greeting_morning');
    if (hour >= 12 && hour < 18) return t('builder.greeting_afternoon');
    if (hour >= 18 && hour < 22) return t('builder.greeting_evening');
    return t('builder.greeting_hey');
  }

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

  function getQty(_sub: string) {
    return slots.find(s => s.category === selectedCategory?.key)?.quantity ?? 0;
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (totalCount === 0) next.slots = t('builder.error_role');
    if (!title.trim()) next.title = t('builder.error_required');
    if (!description.trim()) next.description = t('builder.error_required');
    if (!deadline) next.deadline = t('builder.error_required');
    if (!location.trim()) next.location = t('builder.error_required');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      if (isEditMode && projectId) {
        await updateProject(projectId, slots, { title, description, exec, deadline, location });
        showToast(t('builder.project_updated'), 'success');
      } else {
        await submit(slots, { title, description, exec, deadline, location });
      }
      router.back();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : undefined;
      showToast(
        message ?? (isEditMode ? t('builder.failed_update') : t('builder.failed_submit')),
        'error',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function getSubmitLabel(): string {
    if (isSubmitting) return isEditMode ? t('builder.saving') : t('builder.submitting');
    if (isEditMode) return t('builder.save_changes');
    if (totalCount > 0) return t('builder.submit_request_roles', { count: totalCount });
    return t('builder.submit_request');
  }

  function getCategoryLabel(labelKey: string): string {
    if (labelKey === 'AI') return 'AI';
    return t(labelKey);
  }

  if (isLoadingProject) {
    return (
      <Screen scrollable={false}>
        <ActivityIndicator color={colors.accent} style={{ flex: 1, marginTop: 80 }} />
      </Screen>
    );
  }

  return (
    <Screen scrollable={false} backgroundColor={colors.bg}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <View style={styles.logoWrap}>
            <Image source={BAMA_LOGO} style={styles.bamaLogo} contentFit="contain" cachePolicy="memory-disk" />
          </View>
          <Text style={[styles.greetText, { color: colors.text }, Platform.OS === 'web' && gradientStyle]} numberOfLines={2}>
            {getGreeting()}, {user?.displayName} :)
          </Text>
        </View>

        <Text style={[styles.pageTitle, Platform.OS === 'web' && gradientStyle, Platform.OS !== 'web' && { color: colors.accent }]}>
          Build Your Crew
        </Text>

        <View style={styles.fieldsWrap}>
          <Text style={[styles.label, { color: colors.textSec }]}>{t('builder.title')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
            value={title}
            onChangeText={setTitle}
            placeholder={t('builder.placeholder_title')}
            placeholderTextColor={colors.placeholder}
          />
          {errors.title ? <Text style={styles.error}>{errors.title}</Text> : null}

          <Text style={[styles.label, { color: colors.textSec }]}>{t('builder.description')}</Text>
          <TextInput
            style={[styles.input, styles.multiline, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('builder.placeholder_description')}
            placeholderTextColor={colors.placeholder}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          {errors.description ? <Text style={styles.error}>{errors.description}</Text> : null}

          <Text style={[styles.label, { color: colors.textSec }]}>
            {t('builder.execution')}{' '}
            <Text style={{ fontWeight: '400', color: colors.textMuted }}>({t('builder.optional')})</Text>
          </Text>
          <TouchableOpacity
            style={[styles.dateBtn, styles.dateBtnFull, { backgroundColor: colors.inputBg, borderColor: errors.exec ? '#fc8181' : colors.inputBorder }]}
            onPress={() => setCalOpen('exec')}
            activeOpacity={0.8}
          >
            <Text style={[styles.dateBtnText, { color: exec ? colors.text : colors.placeholder }]}>
              {exec || t('builder.placeholder_date')}
            </Text>
            <Calendar size={18} color="#000" strokeWidth={1.8} />
          </TouchableOpacity>
          {errors.exec ? <Text style={styles.error}>{errors.exec}</Text> : null}

          <Text style={[styles.label, { color: colors.textSec }]}>{t('builder.deadline')}</Text>
          <TouchableOpacity
            style={[styles.dateBtn, styles.dateBtnFull, { backgroundColor: colors.inputBg, borderColor: errors.deadline ? '#fc8181' : colors.inputBorder }]}
            onPress={() => setCalOpen('deadline')}
            activeOpacity={0.8}
          >
            <Text style={[styles.dateBtnText, { color: deadline ? colors.text : colors.placeholder }]}>
              {deadline || t('builder.placeholder_deadline')}
            </Text>
            <Calendar size={18} color="#000" strokeWidth={1.8} />
          </TouchableOpacity>
          {errors.deadline ? <Text style={styles.error}>{errors.deadline}</Text> : null}

          <Text style={[styles.label, { color: colors.textSec }]}>{t('builder.location')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
            value={location}
            onChangeText={setLocation}
            placeholder={t('builder.placeholder_location')}
            placeholderTextColor={colors.placeholder}
          />
          {errors.location ? <Text style={styles.error}>{errors.location}</Text> : null}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text, textAlign: 'center', marginTop: 20 }, Platform.OS === 'web' && gradientStyle]}>
          {t('builder.select_roles')}
        </Text>

        {/* Select roles — image grid */}
        <View style={styles.rolesCard}>
          {errors.slots ? <Text style={styles.error}>{errors.slots}</Text> : null}

          <View style={styles.grid}>
            {CATEGORIES.map((cat) => {
              const catTotal = slots
                .filter(s => s.category === cat.key)
                .reduce((sum, s) => sum + s.quantity, 0);
              return (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.tile, { width: tileSize, height: tileSize }, cat.contain && { backgroundColor: '#111' }]}
                  onPress={() => openCategory(cat)}
                  activeOpacity={0.85}
                >
                  {cat.image ? (
                    <Image source={cat.image} style={styles.tileImage} contentFit={cat.contain ? 'contain' : 'cover'} cachePolicy="memory-disk" />
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
            })}
          </View>
        </View>

        <View style={styles.submitWrap}>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              isSubmitting && styles.disabled,
              Platform.OS === 'web' && ({ background: isSubmitting ? '#004aad' : 'linear-gradient(to right, #004aad, #cb6ce6)' } as object),
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            <Text style={styles.submitText}>{getSubmitLabel()}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Calendar picker */}
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

      {/* Subcategory modal */}
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

                <FlatList
                  data={selectedCategory?.subcategories ?? []}
                  keyExtractor={(sub) => sub}
                  numColumns={3}
                  scrollEnabled={true}
                  style={styles.panelScroll}
                  contentContainerStyle={styles.rolesGrid}
                  columnWrapperStyle={styles.rolesRow}
                  ListHeaderComponent={<Text style={[styles.subHint, { color: colors.textMuted }]}>{t('builder.tap_to_add')}</Text>}
                  renderItem={({ item: sub }) => {
                    const qty = getQty(sub);
                    return (
                      <View style={[styles.roleCell, { borderColor: qty > 0 ? colors.accent : '#004aad', backgroundColor: colors.card }]}>
                        <Text style={[styles.roleCellLabel, { color: colors.text }]} numberOfLines={2}>{sub}</Text>
                        <View style={styles.qtyControls}>
                          {qty > 0 && (
                            <TouchableOpacity style={[styles.qtyBtn, { borderColor: colors.inputBorder }]} onPress={() => removeSlot(selectedCategory!.key)} hitSlop={8} activeOpacity={0.7}>
                              <Text style={[styles.qtyBtnText, { color: colors.textMuted }]}>−</Text>
                            </TouchableOpacity>
                          )}
                          {qty > 0 && (
                            <View style={[styles.qtyBadge, { backgroundColor: colors.accent }]}>
                              <Text style={styles.qtyBadgeText}>{qty}</Text>
                            </View>
                          )}
                          <TouchableOpacity style={[styles.qtyBtn, { borderColor: colors.accent, backgroundColor: colors.accent + '22' }]} onPress={() => addSlot(selectedCategory!.key)} hitSlop={8} activeOpacity={0.7}>
                            <Text style={[styles.qtyBtnText, { color: colors.accent }]}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  }}
                />
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  logoWrap: { alignItems: 'flex-start', justifyContent: 'center', marginLeft: -130 },
  bamaLogo: { width: 640, height: 100 },
  greetText: { fontSize: 18, fontWeight: '600', textAlign: 'right', flexShrink: 1, maxWidth: 180 },
  pageTitle: { fontSize: 52, fontWeight: '900', marginTop: 24, marginHorizontal: 16, textAlign: 'center', textTransform: 'uppercase' },
  fieldsWrap: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  rolesCard: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  multiline: { height: 100 },
  error: { fontSize: 12, color: '#fc8181', marginTop: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  tileImage: { width: '100%', height: '100%', position: 'absolute' },
  tileOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 4,
    paddingHorizontal: 5,
  },
  tileLabel: { fontSize: 12, fontWeight: '700', color: '#fff', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  tileBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  tileBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  submitWrap: { padding: 16, paddingBottom: 32 },
  submitBtn: {
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  disabled: { backgroundColor: '#555' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 24,
    borderWidth: 2,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  panelTitle: { fontSize: 20, fontWeight: '800' },
  closeBtn: { fontSize: 18, fontWeight: '600' },
  panelDivider: { height: 2, marginHorizontal: 20, borderRadius: 1, marginBottom: 4 },
  panelScroll: { maxHeight: 400, width: '100%' },
  subHint: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rolesGrid: {
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  rolesRow: {
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  roleCell: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    marginHorizontal: 4,
  },
  roleCellLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 16, lineHeight: 18, fontWeight: '700' },
  qtyBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  qtyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  dateBtnFull: { flex: 0, marginTop: 6 },
  dateBtnText: { fontSize: 15, flex: 1 },
});

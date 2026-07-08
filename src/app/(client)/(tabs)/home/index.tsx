import { useState, useRef, useEffect } from 'react';
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
import type { ProjectRequest } from '@core/types/project';

const CATEGORY_META: Record<string, { label: string; image: ReturnType<typeof require> }> = {
  'Video Photographer': { label: 'Videographer', image: require('../../../../../assets/images/categories/videographer.png') },
  'Still Photographer': { label: 'Photographer', image: require('../../../../../assets/images/categories/photographer.png') },
  'Editor':             { label: 'Editor',        image: require('../../../../../assets/images/categories/editor.png') },
  'Graphic Designer':   { label: 'Graphic Designer', image: require('../../../../../assets/images/categories/graphic-designer.png') },
  'AI Specialist':      { label: 'AI',            image: require('../../../../../assets/images/categories/ai.png') },
  'Social Media':       { label: 'Social',        image: require('../../../../../assets/images/categories/social.png') },
  'Studio & Audio':     { label: 'Studios',       image: require('../../../../../assets/images/categories/studios.png') },
  'Lighting Tech':      { label: 'Lighting',      image: require('../../../../../assets/images/categories/lighting.png') },
  'Sound Recordist':    { label: 'Sound',         image: require('../../../../../assets/images/categories/sound.png') },
};

const CATEGORIES = Object.entries(CREW_CATEGORIES).map(([key, subs]) => ({
  key,
  label: CATEGORY_META[key]?.label ?? key,
  image: CATEGORY_META[key]?.image,
  subcategories: subs,
}));

const webInputShadow = { boxShadow: '0 0 14px #7b4fd422, 0 0 28px #004aad14' } as any;

const gradientStyle = {
  background: 'linear-gradient(to right, #004aad, #cb6ce6)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
} as any;

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
    if (totalCount === 0) next.slots = 'Select at least one role.';
    if (!title.trim()) next.title = 'Required';
    if (!description.trim()) next.description = 'Required';
    if (!deadline) next.deadline = 'Required';
    if (!location.trim()) next.location = 'Required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      if (isEditMode && projectId) {
        await updateProject(projectId as string, slots, { title, description, exec, deadline, location });
        showToast('Project updated!', 'success');
        resetSlots();
        setTitle('');
        setExec(''); setDeadline('');
        setLocation('');
        setErrors({});
        router.navigate('/(client)/(tabs)/chats' as any);
      } else {
        await submit(slots, { title, description, exec, deadline, location });
        resetSlots();
        setTitle('');
        setExec(''); setDeadline('');
        setLocation('');
        setErrors({});
        showToast('Request submitted!', 'success');
      }
    } catch (e: any) {
      showToast(e.message ?? (isEditMode ? 'Failed to update project' : 'Failed to submit request'), 'error');
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

  return (
    <Screen scrollable={false}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.pageTitle, Platform.OS === 'web' && gradientStyle, Platform.OS !== 'web' && { color: colors.accent }]}>
          Build Your Crew
        </Text>

        <Text style={[styles.sectionTitle, { color: '#ffffff', textAlign: 'center', marginTop: 20, textTransform: 'uppercase', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }, Platform.OS === 'web' && { textShadow: '0 2px 8px rgba(0,0,0,0.4)' } as any]}>Project Details</Text>

        <View style={styles.card}>

          <Text style={[styles.label, { color: '#7b2fa8' }]}>Title</Text>
          <TextInput
            style={[styles.input, { backgroundColor: '#ffffff', color: colors.text }, Platform.OS === 'web' && webInputShadow]}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Music video for new single"
            placeholderTextColor="#7b2fa899"
          />
          {errors.title ? <Text style={styles.error}>{errors.title}</Text> : null}

          <Text style={[styles.label, { color: '#7b2fa8' }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline, { backgroundColor: '#ffffff', color: colors.text }, Platform.OS === 'web' && webInputShadow]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your project"
            placeholderTextColor="#7b2fa899"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          {errors.description ? <Text style={styles.error}>{errors.description}</Text> : null}

          <View style={styles.dateRow}>
            <View style={styles.dateCol}>
              <Text style={[styles.label, { color: '#7b2fa8', marginTop: 0 }]}>Execution <Text style={{ fontWeight: '400', color: '#7b2fa899' }}>(opt.)</Text></Text>
              <TouchableOpacity
                style={[styles.dateBtn, { backgroundColor: '#ffffff' }, errors.exec && { borderWidth: 1, borderColor: '#fc8181' }, Platform.OS === 'web' && webInputShadow]}
                onPress={() => setCalOpen('exec')}
                activeOpacity={0.8}
              >
                <Text style={[styles.dateBtnText, { color: exec ? colors.text : '#7b2fa899' }]} numberOfLines={1}>{exec || 'Select'}</Text>
                <Calendar size={14} color="#cb6ce6" strokeWidth={1.8} />
              </TouchableOpacity>
              {errors.exec ? <Text style={styles.error}>{errors.exec}</Text> : null}
            </View>

            <View style={styles.dateCol}>
              <Text style={[styles.label, { color: '#7b2fa8', marginTop: 0 }]}>Deadline</Text>
              <TouchableOpacity
                style={[styles.dateBtn, { backgroundColor: '#ffffff' }, errors.deadline && { borderWidth: 1, borderColor: '#fc8181' }, Platform.OS === 'web' && webInputShadow]}
                onPress={() => setCalOpen('deadline')}
                activeOpacity={0.8}
              >
                <Text style={[styles.dateBtnText, { color: deadline ? colors.text : '#7b2fa899' }]} numberOfLines={1}>{deadline || 'Select'}</Text>
                <Calendar size={14} color="#cb6ce6" strokeWidth={1.8} />
              </TouchableOpacity>
              {errors.deadline ? <Text style={styles.error}>{errors.deadline}</Text> : null}
            </View>
          </View>

          <Text style={[styles.label, { color: '#7b2fa8' }]}>Location</Text>
          <TextInput
            style={[styles.input, { backgroundColor: '#ffffff', color: colors.text }, Platform.OS === 'web' && webInputShadow]}
            value={location}
            onChangeText={setLocation}
            placeholder="City, Country"
            placeholderTextColor="#7b2fa899"
          />
          {errors.location ? <Text style={styles.error}>{errors.location}</Text> : null}
        </View>

        <Text style={[styles.sectionTitle, { color: '#ffffff', textAlign: 'center', marginTop: 20, textTransform: 'uppercase', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }, Platform.OS === 'web' && { textShadow: '0 2px 8px rgba(0,0,0,0.4)' } as any]}>Select Roles</Text>

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
                  style={[styles.tile, { width: tileSize, height: tileSize }]}
                  onPress={() => openCategory(cat)}
                  activeOpacity={0.85}
                >
                  {cat.image ? (
                    <Image source={cat.image} style={styles.tileImage} resizeMode="cover" />
                  ) : null}
                  <View style={styles.tileOverlay}>
                    <Text style={styles.tileLabel} numberOfLines={1}>{cat.label}</Text>
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
              Platform.OS === 'web' && ({ background: isSubmitting ? '#004aad' : 'linear-gradient(to right, #004aad, #cb6ce6)' } as any),
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            <Text style={styles.submitText}>
              {isSubmitting
                ? (isEditMode ? 'Saving…' : 'Submitting…')
                : isEditMode
                  ? 'Save Changes'
                  : `Submit Request${totalCount > 0 ? ` (${totalCount} role${totalCount === 1 ? '' : 's'})` : ''}`}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

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
                  Platform.OS === 'web' && ({ boxShadow: '0 0 48px #7b4fd488' } as any),
                ]}
              >
                <View style={styles.panelHeader}>
                  <Text style={[styles.panelTitle, { color: colors.text }]}>{selectedCategory?.label}</Text>
                  <TouchableOpacity onPress={closeModal} hitSlop={12} activeOpacity={0.7}>
                    <Text style={[styles.closeBtn, { color: colors.textMuted }]}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.panelDivider, { backgroundColor: colors.accent }]} />

                <ScrollView showsVerticalScrollIndicator={false} style={styles.panelScroll}>
                  <Text style={[styles.subHint, { color: colors.textMuted }]}>Tap + to add roles</Text>
                  {selectedCategory?.subcategories.map((sub) => {
                    const qty = getQty(sub);
                    return (
                      <View key={sub} style={[styles.subRow, { borderBottomColor: colors.borderMuted }]}>
                        <Text style={[styles.subLabel, { color: colors.text }]}>{sub}</Text>
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

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  pageTitle: { fontSize: 36, fontWeight: '800', fontFamily: 'Montserrat', marginTop: 24, marginHorizontal: 16, textAlign: 'center', textTransform: 'uppercase' },
  card: { margin: 16, marginTop: 24, padding: 20 },
  rolesCard: { marginHorizontal: 16, marginTop: 8, padding: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '800', fontFamily: 'Montserrat', marginBottom: 12 },
  label: { fontSize: 18, fontWeight: '600', fontFamily: 'Montserrat', marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 0, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, fontFamily: 'Montserrat' },
  multiline: { height: 100 },
  error: { fontSize: 12, color: '#fc8181', marginTop: 4, fontFamily: 'Montserrat' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { borderRadius: 12, overflow: 'hidden', position: 'relative' },
  tileImage: { width: '100%', height: '100%', position: 'absolute' },
  tileOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 4, paddingHorizontal: 5 },
  tileLabel: { fontSize: 17, fontWeight: '700', fontFamily: 'Montserrat', color: '#004aad', textAlign: 'center', textShadowColor: 'rgba(255,255,255,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  tileBadge: { position: 'absolute', top: 5, right: 5, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tileBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', fontFamily: 'Montserrat' },
  submitWrap: { padding: 16, paddingBottom: 32 },
  submitBtn: { backgroundColor: '#004aad', borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  disabled: { backgroundColor: '#555' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'Montserrat' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxHeight: '80%', borderRadius: 24, borderWidth: 2, overflow: 'hidden' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  panelTitle: { fontSize: 20, fontWeight: '800', fontFamily: 'Montserrat' },
  closeBtn: { fontSize: 18, fontWeight: '600', fontFamily: 'Montserrat' },
  panelDivider: { height: 2, marginHorizontal: 20, borderRadius: 1, marginBottom: 4 },
  panelScroll: { maxHeight: 400 },
  subHint: { fontSize: 12, fontWeight: '600', fontFamily: 'Montserrat', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 20, paddingVertical: 12 },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1 },
  subLabel: { fontSize: 15, fontWeight: '500', fontFamily: 'Montserrat', flex: 1 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: 16, lineHeight: 18, fontWeight: '700', fontFamily: 'Montserrat' },
  qtyBadge: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  qtyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800', fontFamily: 'Montserrat' },

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
  dateBtnText: { fontSize: 13, flex: 1, fontFamily: 'Montserrat' },
});

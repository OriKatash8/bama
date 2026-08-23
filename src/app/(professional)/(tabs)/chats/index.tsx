import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, ScrollView, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Camera, Search, Play, Clock, BookOpen, BarChart2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { uploadFile } from '@core/firebase/storage';
import {
  collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { SubmitCourseModal } from '@features/courses/components/SubmitCourseModal';
import { ChatsScreen as ChatsList } from '@features/chat/screens/ChatsScreen';
import { CommunityDiscoveryTab } from '@features/chat/components/CommunityDiscoveryTab';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import { db } from '@core/firebase/config';
import { ROLE_CATEGORIES, categoryLabel } from '@features/crew/data/categories';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

type TabKey = 'chats' | 'courses' | 'communities';
const TAB_KEYS: TabKey[] = ['chats', 'courses', 'communities'];

type Course = {
  id: string;
  title: string;
  description: string;
  price: number;
  instructorName: string;
  courseUrl?: string;
  category?: string;
  coverImageUrl?: string;
  durationHours?: number;
  lessonsCount?: number;
  level?: string;
};

export default function ProfessionalChatsScreen() {
  const colors = useTheme();
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const user = useAuthStore((s) => s.user);
  const { showToast } = useUiStore();

  const [active, setActive] = useState<TabKey>('chats');
  const [searchQuery, setSearchQuery] = useState('');

  // Communities state
  const [commModal, setCommModal] = useState(false);
  const [commName, setCommName] = useState('');
  const [commDesc, setCommDesc] = useState('');
  const [commCategory, setCommCategory] = useState('');
  const [commShowCategoryPicker, setCommShowCategoryPicker] = useState(false);
  const [commPhotoUri, setCommPhotoUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Courses state
  const [courses, setCourses] = useState<Course[]>([]);
  const [submitCourseModal, setSubmitCourseModal] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'courses'),
      where('published', '==', true),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Course)));
    });
  }, []);

  async function handlePickCommunityPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setCommPhotoUri(result.assets[0].uri);
  }

  async function handleSubmitCommunityRequest() {
    console.log('[communityRequest] submit tapped — name:', commName, 'desc:', commDesc, 'user:', user?.id);
    if (!commName.trim() || !commDesc.trim()) {
      showToast(t('communities.name_placeholder') + ' and description are required', 'error');
      return;
    }
    if (!user) {
      console.log('[communityRequest] aborted — no user');
      return;
    }
    setSubmitting(true);
    let photoURL: string | undefined;
    if (commPhotoUri) {
      setUploadingPhoto(true);
      try {
        const blob = await fetch(commPhotoUri).then((r) => r.blob());
        photoURL = await uploadFile(`community-images/${Date.now()}.jpg`, blob);
      } catch (e) {
        console.log('[communityRequest] photo upload error:', e);
      } finally {
        setUploadingPhoto(false);
      }
    }
    const payload = {
      name: commName.trim(),
      description: commDesc.trim(),
      requesterId: user.id,
      requesterName: user.displayName,
      status: 'pending',
      createdAt: serverTimestamp(),
      ...(commCategory ? { category: commCategory } : {}),
      ...(photoURL ? { photoURL } : {}),
    };
    try {
      const ref = await addDoc(collection(db, 'communityRequests'), payload);
      console.log('[communityRequest] success — docId:', ref.id);
      showToast(t('communities.request_sent'), 'success');
      setCommModal(false);
      setCommName('');
      setCommDesc('');
      setCommCategory('');
      setCommPhotoUri(null);
    } catch (error) {
      console.log('[communityRequest] error:', error);
      showToast('Failed to submit request', 'error');
    }
    setSubmitting(false);
  }

  const TAB_LABELS: Record<TabKey, string> = {
    chats:       t('chats_page.tab_chats'),
    courses:     t('chats_page.tab_courses'),
    communities: t('chats_page.tab_communities'),
  };

  return (
    <View style={{ flex: 1 }}>
    <Screen style={{ padding: 0, paddingBottom: 100 }}>
      {/* Header */}
      <View style={styles.headerWrap}>
        <View style={[styles.gradient, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
          <View style={styles.tabBar}>
            {TAB_KEYS.map((key) => {
              const isActive = active === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.tab}
                  onPress={() => { setActive(key); setSearchQuery(''); }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.tabPill, isActive && styles.tabPillActive]}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.tabText,
                        { color: colors.textSec, ...(isActive ? font.bold : font.regular), textAlign: rtl ? 'right' : 'left' },
                        isActive && styles.tabTextActive,
                      ]}
                    >
                      {TAB_LABELS[key]}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Chats tab */}
      {active === 'chats' && (
        <>
          <View style={[styles.searchRow, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
            <Search size={18} color={colors.placeholder} strokeWidth={2.5} />
            <TextInput
              style={[styles.searchInput, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
              placeholder={t('search.placeholder')}
              placeholderTextColor={colors.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                <Text style={{ color: colors.textMuted, fontSize: 14, paddingHorizontal: 4 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <ChatsList scrollable={false} searchQuery={searchQuery} />
        </>
      )}

      {/* Communities tab */}
      {active === 'communities' && (
        <CommunityDiscoveryTab onRequestCommunity={() => setCommModal(true)} />
      )}

      {/* Courses tab */}
      {active === 'courses' && (
        <View>
          <View style={styles.tabContentHeader}>
            <Text style={[styles.myCoursesTitle, { ...font.bold, color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}>
              {t('courses.my_courses')}
            </Text>
          </View>

          {courses.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { ...font.regular, color: colors.textMuted }]}>
                {t('courses.empty')}
              </Text>
            </View>
          ) : (
            <FlatList
              data={courses}
              keyExtractor={(c) => c.id}
              scrollEnabled={false}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 16, gap: 12 }}
              renderItem={({ item }) => (
                <View style={styles.courseCard}>
                  {/* Cover */}
                  <View style={styles.coverArea}>
                    {item.coverImageUrl ? (
                      <Image source={{ uri: item.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <LinearGradient colors={['#534AB7', '#cb6ce6']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                        <View style={styles.coverCenter}>
                          <Play size={32} color="rgba(255,255,255,0.9)" fill="rgba(255,255,255,0.9)" />
                        </View>
                      </LinearGradient>
                    )}
                    {item.category ? (
                      <View style={[styles.categoryTag, { [rtl ? 'right' : 'left']: 10 }]}>
                        <Text style={[styles.categoryTagText, { ...font.semiBold }]}>
                          {item.category ? categoryLabel(item.category, rtl ? 'he' : 'en') : item.category}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Body */}
                  <View style={styles.cardBody}>
                    {/* Title + price */}
                    <View style={[styles.titlePriceRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                      <Text style={[styles.cardTitle, { ...font.bold, color: colors.text, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={[styles.coursePrice, { ...font.bold, color: colors.primary }]}>
                        ₪{item.price.toLocaleString()}
                      </Text>
                    </View>

                    {/* Description */}
                    {!!item.description && (
                      <Text style={[styles.cardDesc, { ...font.regular, color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
                        {item.description}
                      </Text>
                    )}

                    {/* Metadata row */}
                    {!!(item.durationHours || item.lessonsCount || item.level) && (
                      <View style={[styles.metaRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                        {!!item.durationHours && (
                          <View style={styles.metaChip}>
                            <Clock size={12} color={colors.textMuted} strokeWidth={1.8} />
                            <Text style={[styles.metaText, { ...font.regular, color: colors.textMuted }]}>{item.durationHours} {t('courses.hours')}</Text>
                          </View>
                        )}
                        {!!item.lessonsCount && (
                          <View style={styles.metaChip}>
                            <BookOpen size={12} color={colors.textMuted} strokeWidth={1.8} />
                            <Text style={[styles.metaText, { ...font.regular, color: colors.textMuted }]}>{item.lessonsCount} {t('courses.lessons')}</Text>
                          </View>
                        )}
                        {!!item.level && (
                          <View style={styles.metaChip}>
                            <BarChart2 size={12} color={colors.textMuted} strokeWidth={1.8} />
                            <Text style={[styles.metaText, { ...font.regular, color: colors.textMuted }]}>{item.level}</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Footer: instructor + visit */}
                    <View style={[styles.cardFooter, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                      <View style={[styles.instructorRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                        <View style={styles.instructorAvatar}>
                          <Text style={[styles.instructorInitial, { ...font.bold }]}>
                            {item.instructorName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ alignItems: rtl ? 'flex-end' : 'flex-start' }}>
                          <Text style={[styles.instructorName, { ...font.semiBold, color: colors.text }]} numberOfLines={2}>
                            {item.instructorName}
                          </Text>
                          <Text style={[styles.instructorBadge, { ...font.regular, color: colors.textMuted }]}>
                            {t('courses.instructor_badge')}
                          </Text>
                        </View>
                      </View>
                      {!!item.courseUrl && (
                        <TouchableOpacity onPress={() => Linking.openURL(item.courseUrl!)} activeOpacity={0.8} style={styles.visitBtn}>
                          <Text style={[styles.visitBtnText, { ...font.semiBold }]}>{t('courses.visit_course')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* Community request modal */}
      <Modal visible={commModal} transparent animationType="fade" onRequestClose={() => { setCommModal(false); setCommPhotoUri(null); setCommCategory(''); setCommShowCategoryPicker(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => { setCommModal(false); setCommPhotoUri(null); setCommCategory(''); setCommShowCategoryPicker(false); }}>
            <TouchableOpacity activeOpacity={1}>
              <LinearGradient colors={['#1a237e', '#004aad']} style={styles.modal}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { ...font.bold }]}>{t('communities.modal_title')}</Text>
                  <TouchableOpacity onPress={() => { setCommModal(false); setCommPhotoUri(null); setCommCategory(''); setCommShowCategoryPicker(false); }}>
                    <X size={22} color="#fff" />
                  </TouchableOpacity>
                </View>

                {/* Avatar picker */}
                <TouchableOpacity style={styles.avatarPicker} onPress={handlePickCommunityPhoto} activeOpacity={0.8}>
                  {commPhotoUri ? (
                    <Image source={{ uri: commPhotoUri }} style={{ width: 72, height: 72, borderRadius: 16 }} contentFit="cover" />
                  ) : (
                    <LinearGradient colors={['#1e4fa3', '#cb6ce6']} style={{ width: 72, height: 72, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                      <Camera size={28} color="#fff" strokeWidth={1.5} />
                    </LinearGradient>
                  )}
                  <View style={styles.cameraBadge}>
                    <Camera size={12} color="#fff" strokeWidth={2} />
                  </View>
                </TouchableOpacity>

                <TextInput
                  placeholder={t('communities.name_placeholder')}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={commName}
                  onChangeText={setCommName}
                  style={[styles.input, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
                />

                {/* Category picker */}
                <TouchableOpacity
                  style={[styles.input, { justifyContent: 'center' }]}
                  onPress={() => setCommShowCategoryPicker(!commShowCategoryPicker)}
                  activeOpacity={0.8}
                >
                  <Text style={[{ ...font.regular, color: commCategory ? '#fff' : 'rgba(255,255,255,0.5)', textAlign: rtl ? 'right' : 'left' }]}>
                    {commCategory || t('communities.select_category')}
                  </Text>
                </TouchableOpacity>
                {commShowCategoryPicker && (
                  <View style={styles.commCategoryPicker}>
                    <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {ROLE_CATEGORIES.map((cat) => (
                        <TouchableOpacity
                          key={cat}
                          style={styles.commCategoryItem}
                          onPress={() => { setCommCategory(cat); setCommShowCategoryPicker(false); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.commCategoryItemText, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}>{categoryLabel(cat, rtl ? 'he' : 'en')}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <TextInput
                  placeholder={t('communities.description_placeholder')}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={commDesc}
                  onChangeText={setCommDesc}
                  multiline
                  numberOfLines={3}
                  style={[styles.input, { ...font.regular, height: 80, textAlignVertical: 'top', textAlign: rtl ? 'right' : 'left' }]}
                />
                <TouchableOpacity
                  style={[styles.submitBtn, { opacity: (submitting || uploadingPhoto) ? 0.6 : 1 }]}
                  onPress={handleSubmitCommunityRequest}
                  disabled={submitting || uploadingPhoto}
                >
                  {(submitting || uploadingPhoto)
                    ? <ActivityIndicator color="#004aad" />
                    : <Text style={[styles.submitBtnText, { ...font.bold }]}>{t('communities.submit')}</Text>
                  }
                </TouchableOpacity>
              </LinearGradient>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Submit course modal */}
      <SubmitCourseModal
        visible={submitCourseModal}
        onClose={() => setSubmitCourseModal(false)}
        onSubmitted={() => {
          setSubmitCourseModal(false);
          showToast(t('courses.course_submitted'), 'success');
        }}
      />

    </Screen>

    {/* FAB — communities tab: sibling of Screen so position:absolute anchors to viewport */}
    {active === 'communities' && (
      <TouchableOpacity style={styles.fab} onPress={() => setCommModal(true)} activeOpacity={0.8}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    )}

    {/* FAB — courses tab */}
    {active === 'courses' && (
      <TouchableOpacity style={styles.fab} onPress={() => setSubmitCourseModal(true)} activeOpacity={0.8}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    alignSelf: 'stretch',
  },
  gradient: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 16,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#004aad',
    textShadowColor: 'transparent',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
    textTransform: 'uppercase',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  tabBar: {
    flexDirection: 'row',
    width: '100%',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabPill: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  tabPillActive: {
    backgroundColor: 'rgba(0,74,173,0.12)',
  },
  tabText: {
    fontSize: 15,
  },
  tabTextActive: {
    color: '#004aad',
    fontWeight: '700',
  },
  tabContentHeader: {
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  myCoursesTitle: { fontSize: 18 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 110,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#004aad',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 34 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
  },
  courseCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    marginHorizontal: 16,
  },
  coverArea: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1a1a2e',
    overflow: 'hidden',
  },
  coverCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  categoryTag: {
    position: 'absolute',
    top: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryTagText: { fontSize: 11, color: '#fff' },
  cardBody: { padding: 14, gap: 8 },
  titlePriceRow: { alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontSize: 18, flex: 1 },
  coursePrice: { fontSize: 16 },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  metaRow: { flexWrap: 'wrap', gap: 8 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11 },
  cardFooter: { alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  instructorRow: { alignItems: 'center', gap: 8, flex: 1 },
  instructorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructorInitial: { color: '#fff', fontSize: 14 },
  instructorName: { fontSize: 13 },
  instructorBadge: { fontSize: 11 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: 320,
    borderRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    color: '#004aad',
    fontSize: 16,
  },
  modalCourseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  modalCourseTitle: {
    color: '#fff',
    fontSize: 14,
  },
  modalCourseSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  modalCoursePrice: {
    color: '#fff',
    fontSize: 14,
  },
  visitBtn: {
    backgroundColor: '#004aad',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  visitBtnText: { color: '#fff', fontSize: 13 },
  commCategoryPicker: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
  },
  commCategoryItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  commCategoryItemText: { color: '#fff', fontSize: 14 },
  avatarPicker: { alignSelf: 'center', marginBottom: 16, position: 'relative' },
  cameraBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
});

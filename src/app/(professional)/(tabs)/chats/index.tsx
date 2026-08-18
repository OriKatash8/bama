import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, ScrollView, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Plus, Camera, Search } from 'lucide-react-native';
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
      ...(photoURL ? { photoURL } : {}),
    };
    try {
      const ref = await addDoc(collection(db, 'communityRequests'), payload);
      console.log('[communityRequest] success — docId:', ref.id);
      showToast(t('communities.request_sent'), 'success');
      setCommModal(false);
      setCommName('');
      setCommDesc('');
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
    <Screen style={{ padding: 0, paddingBottom: 100 }}>
      {/* Header */}
      <View style={styles.headerWrap}>
        <View style={[styles.gradient, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
          <Text style={[styles.headerTitle, { ...font.bold }]}>
            {t('chats_page.title')}
          </Text>
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
          <View style={[styles.tabContentHeader, { flexDirection: rtl ? 'row-reverse' : 'row', justifyContent: 'flex-end' }]}>
            <TouchableOpacity
              style={[styles.plusBtn, { backgroundColor: colors.primary }]}
              onPress={() => setSubmitCourseModal(true)}
            >
              <Plus size={16} color="#fff" />
              <Text style={[styles.plusBtnText, { ...font.semiBold }]}>
                {t('courses.add_your_course')}
              </Text>
            </TouchableOpacity>
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
              contentContainerStyle={{ padding: 16, paddingTop: 8 }}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[styles.cardTitle, { ...font.semiBold, color: colors.text }]}>{item.title}</Text>
                    <Text style={[styles.coursePrice, { ...font.bold, color: colors.primary }]}>₪{item.price}</Text>
                  </View>
                  <Text style={[styles.courseInstructor, { ...font.regular, color: colors.textSec }]}>
                    {item.instructorName}
                  </Text>
                  <Text style={[styles.cardDesc, { ...font.regular, color: colors.textSec }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                  {item.courseUrl ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(item.courseUrl!)}
                      activeOpacity={0.8}
                      style={styles.visitBtn}
                    >
                      <Text style={[styles.visitBtnText, { ...font.semiBold }]}>{t('courses.visit_course')}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* Community request modal */}
      <Modal visible={commModal} transparent animationType="fade" onRequestClose={() => { setCommModal(false); setCommPhotoUri(null); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => { setCommModal(false); setCommPhotoUri(null); }}>
            <TouchableOpacity activeOpacity={1}>
              <LinearGradient colors={['#1a237e', '#004aad']} style={styles.modal}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { ...font.bold }]}>{t('communities.modal_title')}</Text>
                  <TouchableOpacity onPress={() => { setCommModal(false); setCommPhotoUri(null); }}>
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
    paddingVertical: 6,
  },
  tabPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  tabPillActive: {
    backgroundColor: 'rgba(0,74,173,0.12)',
  },
  tabText: {
    fontSize: 13,
  },
  tabTextActive: {
    color: '#004aad',
    fontWeight: '700',
  },
  tabContentHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  plusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  plusBtnText: {
    color: '#fff',
    fontSize: 13,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  cardDesc: {
    fontSize: 13,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  coursePrice: {
    fontSize: 15,
  },
  courseInstructor: {
    fontSize: 12,
    marginTop: 2,
  },
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
  visitBtn: { marginTop: 6, alignSelf: 'flex-start' },
  visitBtnText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, textDecorationLine: 'underline' },
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

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Plus } from 'lucide-react-native';
import {
  collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy,
} from 'firebase/firestore';
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

  // Communities state
  const [commModal, setCommModal] = useState(false);
  const [commName, setCommName] = useState('');
  const [commDesc, setCommDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Courses state
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesModal, setCoursesModal] = useState(false);

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
    const payload = {
      name: commName.trim(),
      description: commDesc.trim(),
      requesterId: user.id,
      requesterName: user.displayName,
      status: 'pending',
      createdAt: serverTimestamp(),
    };
    console.log('[communityRequest] writing to communityRequests:', JSON.stringify({ ...payload, createdAt: 'serverTimestamp()' }));
    setSubmitting(true);
    try {
      const ref = await addDoc(collection(db, 'communityRequests'), payload);
      console.log('[communityRequest] success — docId:', ref.id);
      showToast(t('communities.request_sent'), 'success');
      setCommModal(false);
      setCommName('');
      setCommDesc('');
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
    <Screen scrollable={false}>
      {/* Header */}
      <View style={styles.headerWrap}>
        <View style={styles.gradient}>
          <Text style={[styles.headerTitle, { fontFamily: font.bold }]}>
            {t('chats_page.title')}
          </Text>
          <View style={styles.tabBar}>
            {TAB_KEYS.map((key) => {
              const isActive = active === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.tab}
                  onPress={() => setActive(key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.tabPill, isActive && styles.tabPillActive]}>
                    <Text style={[
                      styles.tabText,
                      { color: colors.textSec, fontFamily: isActive ? font.bold : font.regular, textAlign: rtl ? 'right' : 'left' },
                      isActive && styles.tabTextActive,
                    ]}>
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
      {active === 'chats' && <ChatsList />}

      {/* Communities tab */}
      {active === 'communities' && (
        <CommunityDiscoveryTab onRequestCommunity={() => setCommModal(true)} />
      )}

      {/* Courses tab */}
      {active === 'courses' && (
        <View style={{ flex: 1 }}>
          <View style={[styles.tabContentHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.sectionTitle, { fontFamily: font.semiBold, color: colors.text }]}>
              {t('chats_page.tab_courses')}
            </Text>
            <TouchableOpacity
              style={[styles.plusBtn, { backgroundColor: colors.primary }]}
              onPress={() => setCoursesModal(true)}
            >
              <Plus size={16} color="#fff" />
              <Text style={[styles.plusBtnText, { fontFamily: font.semiBold }]}>
                {t('courses.browse')}
              </Text>
            </TouchableOpacity>
          </View>

          {courses.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { fontFamily: font.regular, color: colors.textMuted }]}>
                {t('courses.empty')}
              </Text>
            </View>
          ) : (
            <FlatList
              data={courses}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ padding: 16, paddingTop: 8 }}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[styles.cardTitle, { fontFamily: font.semiBold, color: colors.text }]}>{item.title}</Text>
                    <Text style={[styles.coursePrice, { fontFamily: font.bold, color: colors.primary }]}>₪{item.price}</Text>
                  </View>
                  <Text style={[styles.courseInstructor, { fontFamily: font.regular, color: colors.textSec }]}>
                    {item.instructorName}
                  </Text>
                  <Text style={[styles.cardDesc, { fontFamily: font.regular, color: colors.textSec }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* Community request modal */}
      <Modal visible={commModal} transparent animationType="fade" onRequestClose={() => setCommModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setCommModal(false)}>
            <TouchableOpacity activeOpacity={1}>
              <LinearGradient colors={['#1a237e', '#004aad']} style={styles.modal}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { fontFamily: font.bold }]}>{t('communities.modal_title')}</Text>
                  <TouchableOpacity onPress={() => setCommModal(false)}>
                    <X size={22} color="#fff" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  placeholder={t('communities.name_placeholder')}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={commName}
                  onChangeText={setCommName}
                  style={[styles.input, { fontFamily: font.regular, textAlign: rtl ? 'right' : 'left' }]}
                />
                <TextInput
                  placeholder={t('communities.description_placeholder')}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={commDesc}
                  onChangeText={setCommDesc}
                  multiline
                  numberOfLines={3}
                  style={[styles.input, { fontFamily: font.regular, height: 80, textAlignVertical: 'top', textAlign: rtl ? 'right' : 'left' }]}
                />
                <TouchableOpacity
                  style={[styles.submitBtn, { opacity: submitting ? 0.6 : 1 }]}
                  onPress={handleSubmitCommunityRequest}
                  disabled={submitting}
                >
                  {submitting
                    ? <ActivityIndicator color="#004aad" />
                    : <Text style={[styles.submitBtnText, { fontFamily: font.bold }]}>{t('communities.submit')}</Text>
                  }
                </TouchableOpacity>
              </LinearGradient>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Browse courses modal */}
      <Modal visible={coursesModal} transparent animationType="fade" onRequestClose={() => setCoursesModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setCoursesModal(false)}>
          <TouchableOpacity activeOpacity={1}>
            <LinearGradient colors={['#1a237e', '#004aad']} style={[styles.modal, { maxHeight: 500 }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { fontFamily: font.bold }]}>{t('courses.modal_title')}</Text>
                <TouchableOpacity onPress={() => setCoursesModal(false)}>
                  <X size={22} color="#fff" />
                </TouchableOpacity>
              </View>
              {courses.length === 0 ? (
                <Text style={[styles.emptyText, { fontFamily: font.regular, color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingVertical: 24 }]}>
                  {t('courses.empty')}
                </Text>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {courses.map((c) => (
                    <View key={c.id} style={styles.modalCourseRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalCourseTitle, { fontFamily: font.semiBold }]}>{c.title}</Text>
                        <Text style={[styles.modalCourseSub, { fontFamily: font.regular }]}>{c.instructorName}</Text>
                      </View>
                      <Text style={[styles.modalCoursePrice, { fontFamily: font.bold }]}>₪{c.price}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    alignSelf: 'stretch',
    marginHorizontal: -16,
    marginTop: -16,
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 16,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#ffffff',
    textShadowColor: '#004aad',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
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
    paddingHorizontal: 14,
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
});

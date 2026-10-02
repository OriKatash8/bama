import { useState, useEffect } from 'react';
import {
  View, StyleSheet, Modal, Pressable,
  Switch, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, doc,
  serverTimestamp, Timestamp, query, orderBy, getCountFromServer,
} from 'firebase/firestore';
import { X, Pencil, Trash2, Eye, BookOpen, GraduationCap } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { db } from '@core/firebase/config';
import { normalizeCourseUrl } from '@features/courses/courseUrl';
import {
  CourseFormFields, EMPTY_COURSE_DRAFT, courseDraftComplete, uploadCourseCover,
  type CourseDraft, type CourseLevel,
} from '@features/courses/components/CourseFormFields';
import { useUiStore } from '@core/stores/uiStore';
import { confirmDialog } from '@utils/confirmDialog';
import {
  AdminPage, AdminText, Card, CardHead, Chip, CountBadge, EmptyState, IconTile, PillButton,
  StatGrid, StatTile, WhoBlock, RADIUS, SPACE, TYPE, useAdminPalette, useScopedT,
} from '@features/admin/ui';

type Course = {
  id: string;
  title: string;
  description: string;
  price: number;
  instructorName: string;
  videoUrl: string;
  published: boolean;
  createdAt: Timestamp | null;
  courseUrl?: string;
  category?: string;
  coverImageUrl?: string;
  durationHours?: number;
  lessonsCount?: number;
  level?: string;
};

/** The popup's values: the same fields as the pro's "Add your course", plus Published.
 *  `videoUrl` is no longer edited here (the upload was removed) — an existing
 *  course keeps its video untouched when saved. */
type CourseForm = { draft: CourseDraft; videoUrl: string; published: boolean };

type CourseRequest = {
  id: string;
  title: string;
  category: string;
  courseUrl: string;
  instructorName: string;
  price: number;
  description: string;
  submittedBy: string;
  submittedByName: string;
  createdAt: Timestamp | null;
  coverImageUrl?: string;
  durationHours?: number;
  lessonsCount?: number;
  level?: string;
};

const EMPTY_FORM: CourseForm = { draft: EMPTY_COURSE_DRAFT, videoUrl: '', published: false };

/** A stored number back into its field: blank when unset. */
const asField = (n?: number) => (n ? String(n) : '');

/** The admin's courses: pending submissions first, then every course with edit / delete. */
export default function CoursesAdmin() {
  const p = useAdminPalette();
  const router = useRouter();
  const { showToast } = useUiStore();
  const { t, rowDir, textAlign } = useScopedT('courses');
  const { t: tOps } = useScopedT('admin_operations');
  const { t: tDash } = useScopedT('admin_dashboard');
  const { t: tc } = useScopedT('admin_courses');

  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [clicks, setClicks] = useState<Record<string, number>>({});
  const [requests, setRequests] = useState<CourseRequest[]>([]);
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CourseForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'courses'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Course)));
      setCoursesLoaded(true);
    });
  }, []);

  // Unique "Visit course" counts = size of each course's clicks subcollection.
  useEffect(() => {
    let active = true;
    (async () => {
      const entries = await Promise.all(
        courses.map(async (c) => {
          try {
            const snap = await getCountFromServer(collection(db, 'courses', c.id, 'clicks'));
            return [c.id, snap.data().count] as const;
          } catch {
            return [c.id, 0] as const;
          }
        }),
      );
      if (active) setClicks(Object.fromEntries(entries));
    })();
    return () => { active = false; };
  }, [courses]);

  useEffect(() => {
    const q = query(collection(db, 'courseRequests'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CourseRequest)));
      setRequestsLoaded(true);
    });
  }, []);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/admin/operations');
  }

  function openAdd() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function openEdit(course: Course) {
    setEditId(course.id);
    setForm({
      draft: {
        title: course.title ?? '',
        category: course.category ?? '',
        courseUrl: course.courseUrl ?? '',
        instructorName: course.instructorName ?? '',
        price: asField(course.price),
        description: course.description ?? '',
        coverUri: course.coverImageUrl ?? null,
        durationHours: asField(course.durationHours),
        lessonsCount: asField(course.lessonsCount),
        level: (course.level ?? '') as CourseLevel,
      },
      videoUrl: course.videoUrl ?? '',
      published: course.published,
    });
    setModalVisible(true);
  }

  async function handleSave() {
    const d = form.draft;
    if (!courseDraftComplete(d)) {
      showToast(tc('required_missing'), 'error');
      return;
    }
    const courseUrl = normalizeCourseUrl(d.courseUrl);
    if (courseUrl === null) {
      showToast(tc('url_invalid'), 'error');
      return;
    }
    setSaving(true);
    try {
      const coverImageUrl = d.coverUri ? await uploadCourseCover(d.coverUri) : '';
      const base = {
        title: d.title.trim(),
        category: d.category,
        courseUrl,
        instructorName: d.instructorName.trim(),
        price: Number(d.price) || 0,
        description: d.description.trim(),
        videoUrl: form.videoUrl,
        published: form.published,
      };
      // Optional fields: written when set; on an edit, a field emptied is removed.
      const optional = {
        coverImageUrl,
        durationHours: d.durationHours.trim() ? Number(d.durationHours) : '',
        lessonsCount: d.lessonsCount.trim() ? Number(d.lessonsCount) : '',
        level: d.level,
      };
      if (editId) {
        const fields = Object.fromEntries(Object.entries(optional).map(([k, v]) => [k, v === '' ? deleteField() : v]));
        await updateDoc(doc(db, 'courses', editId), { ...base, ...fields });
      } else {
        const fields = Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== ''));
        await addDoc(collection(db, 'courses'), { ...base, ...fields, createdAt: serverTimestamp() });
      }
      showToast(editId ? tc('updated') : tc('created'), 'success');
      setModalVisible(false);
    } catch {
      showToast(tc('save_failed'), 'error');
    }
    setSaving(false);
  }

  /** confirmDialog, not Alert.alert — the latter no-ops on web, where admin runs. */
  async function handleDelete(id: string) {
    const ok = await confirmDialog(tc('delete_title'), tc('delete_body'), { confirm: tc('delete'), cancel: tc('cancel') });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'courses', id));
      showToast(tc('deleted'), 'success');
    } catch {
      showToast(tc('delete_failed'), 'error');
    }
  }

  async function handleApprove(req: CourseRequest) {
    await addDoc(collection(db, 'courses'), {
      title: req.title,
      description: req.description,
      price: req.price,
      instructorName: req.instructorName,
      courseUrl: req.courseUrl,
      videoUrl: '',
      published: true,
      createdAt: serverTimestamp(),
      ...(req.category ? { category: req.category } : {}),
      ...(req.coverImageUrl ? { coverImageUrl: req.coverImageUrl } : {}),
      ...(req.durationHours ? { durationHours: req.durationHours } : {}),
      ...(req.lessonsCount ? { lessonsCount: req.lessonsCount } : {}),
      ...(req.level ? { level: req.level } : {}),
    });
    await deleteDoc(doc(db, 'courseRequests', req.id));
  }

  async function handleReject(id: string) {
    await deleteDoc(doc(db, 'courseRequests', id));
  }

  return (
    <AdminPage
      testID="courses-page"
      title={tOps('courses')}
      subtitle={tc('subtitle')}
      onBack={goBack}
      side={<PillButton variant="primary" label={tc('add')} onPress={openAdd} testID="add-course" />}
    >
      <StatGrid>
        <StatTile
          testID="tile-courses"
          label={tDash('total_courses')}
          value={coursesLoaded ? courses.length : null}
          loading={!coursesLoaded}
          caption={tDash('all_time')}
        />
        <StatTile
          testID="tile-requests"
          label={t('pending_requests')}
          value={requestsLoaded ? requests.length : null}
          loading={!requestsLoaded}
          ring={requests.length > 0}
          caption={requests.length > 0 ? tDash('attention') : t('no_requests')}
        />
      </StatGrid>

      {requests.length > 0 ? (
        <Card priority testID="requests-card">
          <CardHead title={t('pending_requests')} side={<CountBadge n={requests.length} testID="requests-count" />} />
          {requests.map((req) => (
            <View key={req.id} testID={`request-${req.id}`} style={[styles.request, { borderTopColor: p.border }]}>
              <View style={[styles.requestTop, { flexDirection: rowDir }]}>
                <IconTile icon={GraduationCap} tone="warn" />
                <View style={styles.requestText}>
                  <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.rowName, { textAlign }]}>
                    {req.title}
                  </AdminText>
                  <AdminText tabular numberOfLines={1} style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>
                    {req.category} · ₪{req.price}
                  </AdminText>
                  <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>
                    {req.instructorName}
                  </AdminText>
                  <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.accent, textAlign }]}>
                    {req.courseUrl}
                  </AdminText>
                  {req.description ? (
                    <AdminText numberOfLines={2} style={[TYPE.rowMeta, styles.desc, { color: p.text3, textAlign }]}>
                      {req.description}
                    </AdminText>
                  ) : null}
                </View>
              </View>
              <View style={[styles.actions, { flexDirection: rowDir }]}>
                <PillButton
                  variant="primary"
                  label={t('approve')}
                  onPress={() => handleApprove(req)}
                  testID={`approve-${req.id}`}
                />
                <PillButton
                  variant="danger"
                  label={t('reject')}
                  onPress={() => handleReject(req.id)}
                  testID={`reject-${req.id}`}
                />
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Card testID="courses-card">
        <CardHead
          title={t('modal_title')}
          side={coursesLoaded ? <Chip label={String(courses.length)} tabular /> : undefined}
        />
        {!coursesLoaded ? (
          <View style={[styles.loading, { borderTopColor: p.border }]}>
            <ActivityIndicator color={p.accent} />
          </View>
        ) : courses.length === 0 ? (
          <EmptyState text={t('empty')} testID="courses-empty" />
        ) : (
          courses.map((item) => (
            <View
              key={item.id}
              testID={`course-${item.id}`}
              style={[styles.row, { flexDirection: rowDir, borderTopColor: p.border }]}
            >
              <IconTile icon={BookOpen} tone={item.published ? 'accent' : 'neutral'} />
              <WhoBlock name={item.title} meta={`₪${item.price} · ${item.instructorName}`} textAlign={textAlign} />
              <View style={[styles.clicks, { flexDirection: rowDir }]} testID={`clicks-${item.id}`}>
                <Eye size={13} color={p.text3} strokeWidth={2} />
                <AdminText weight="semiBold" tabular style={[TYPE.chip, { color: p.text3 }]}>
                  {clicks[item.id] ?? 0}
                </AdminText>
              </View>
              <StatusChip good={item.published} label={item.published ? tc('live') : tc('draft')} />
              <Pressable
                onPress={() => openEdit(item)}
                hitSlop={6}
                accessibilityRole="button"
                testID={`edit-${item.id}`}
                style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? p.surface3 : p.surface2 }]}
              >
                <Pencil size={16} color={p.accent} strokeWidth={2.2} />
              </Pressable>
              <Pressable
                onPress={() => handleDelete(item.id)}
                hitSlop={6}
                accessibilityRole="button"
                testID={`delete-${item.id}`}
                style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? p.badBg : p.surface2 }]}
              >
                <Trash2 size={16} color={p.bad} strokeWidth={2.2} />
              </Pressable>
            </View>
          ))
        )}
      </Card>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.overlay}>
            <Pressable
              style={[StyleSheet.absoluteFill, styles.scrim, { backgroundColor: p.toastBg }]}
              onPress={() => setModalVisible(false)}
              testID="course-modal-backdrop"
            />
            <View style={[styles.modal, { backgroundColor: p.surface, borderColor: p.border }]} testID="course-modal">
              <View style={[styles.modalHeader, { flexDirection: rowDir }]}>
                <AdminText weight="bold" accessibilityRole="header" style={[styles.modalTitle, { textAlign }]}>
                  {editId ? tc('edit_title') : tc('new_title')}
                </AdminText>
                <Pressable onPress={() => setModalVisible(false)} hitSlop={10} testID="course-modal-close">
                  <X size={22} color={p.text2} />
                </Pressable>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* The same fields as the pro's "Add your course" popup. */}
                <CourseFormFields
                  value={form.draft}
                  onChange={(patch) => setForm((f) => ({ ...f, draft: { ...f.draft, ...patch } }))}
                />

                <View style={[styles.toggleRow, { flexDirection: rowDir, borderColor: p.border }]}>
                  <AdminText weight="medium" style={TYPE.rowName}>{tc('published')}</AdminText>
                  <Switch
                    testID="published-switch"
                    value={form.published}
                    onValueChange={(v) => setForm((f) => ({ ...f, published: v }))}
                    trackColor={{ true: p.good, false: p.surface3 }}
                  />
                </View>

                <View style={[styles.saveRow, { flexDirection: rowDir }]}>
                  {saving ? (
                    <ActivityIndicator color={p.accent} testID="saving" />
                  ) : (
                    <PillButton variant="primary" label={tc('save')} onPress={handleSave} disabled={saving} testID="save-course" />
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AdminPage>
  );
}

/** Live / Draft: green when published, neutral grey when not. */
function StatusChip({ good, label }: { good: boolean; label: string }) {
  const p = useAdminPalette();
  return (
    <View style={[styles.status, { backgroundColor: good ? p.goodBg : p.surface3 }]}>
      <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.chip, { color: good ? p.good : p.text2 }]}>
        {label}
      </AdminText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    alignItems: 'center', gap: 10,
    paddingVertical: SPACE.rowPadV, paddingHorizontal: SPACE.rowPadH, borderTopWidth: 1,
  },
  clicks: { alignItems: 'center', gap: 3, flexShrink: 0 },
  status: { borderRadius: RADIUS.pill, paddingVertical: 3, paddingHorizontal: 9, flexShrink: 0 },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  loading: { paddingVertical: 26, borderTopWidth: 1, alignItems: 'center' },
  request: { paddingVertical: 12, paddingHorizontal: SPACE.rowPadH, borderTopWidth: 1, gap: 10 },
  requestTop: { alignItems: 'flex-start', gap: 12 },
  requestText: { flex: 1, minWidth: 0, gap: 1 },
  desc: { marginTop: 3 },
  actions: { gap: 7 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACE.gutter },
  scrim: { opacity: 0.45 },
  modal: { width: '100%', maxWidth: 420, maxHeight: 600, borderRadius: RADIUS.card, borderWidth: 1, padding: 20 },
  modalHeader: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10 },
  modalTitle: { fontSize: 20, letterSpacing: -0.3, flex: 1 },
  toggleRow: {
    alignItems: 'center', justifyContent: 'space-between',
    // The form's last field (Level) sits right above: room before the divider.
    borderTopWidth: 1, paddingTop: 12, marginTop: 20, marginBottom: 16,
  },
  saveRow: { justifyContent: 'flex-end', alignItems: 'center', minHeight: 32 },
});

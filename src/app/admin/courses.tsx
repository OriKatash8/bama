import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, Switch, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, Timestamp, query, orderBy,
} from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Plus, Pencil, Trash2, Video } from 'lucide-react-native';
import { db } from '@core/firebase/config';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useAuthStore } from '@core/stores/authStore';
import { useVideoUpload } from '@core/hooks/useVideoUpload';
import { useUiStore } from '@core/stores/uiStore';

type Course = {
  id: string;
  title: string;
  description: string;
  price: number;
  instructorName: string;
  videoUrl: string;
  published: boolean;
  createdAt: Timestamp | null;
};

type CourseForm = Omit<Course, 'id' | 'createdAt'>;

const EMPTY_FORM: CourseForm = {
  title: '',
  description: '',
  price: 0,
  instructorName: '',
  videoUrl: '',
  published: false,
};

export default function CoursesAdmin() {
  const colors = useTheme();
  const font = useAppFont();
  const user = useAuthStore((s) => s.user);
  const { showToast } = useUiStore();
  const { uploading, processing, uploadVideo } = useVideoUpload();

  const [courses, setCourses] = useState<Course[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CourseForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'courses'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Course)));
    });
  }, []);

  function openAdd() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function openEdit(course: Course) {
    setEditId(course.id);
    setForm({
      title: course.title,
      description: course.description,
      price: course.price,
      instructorName: course.instructorName,
      videoUrl: course.videoUrl,
      published: course.published,
    });
    setModalVisible(true);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      showToast('Title is required', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db, 'courses', editId), { ...form, price: Number(form.price) });
      } else {
        await addDoc(collection(db, 'courses'), {
          ...form,
          price: Number(form.price),
          createdAt: serverTimestamp(),
        });
      }
      showToast(editId ? 'Course updated' : 'Course created', 'success');
      setModalVisible(false);
    } catch {
      showToast('Failed to save course', 'error');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete Course', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteDoc(doc(db, 'courses', id));
          showToast('Course deleted', 'success');
        },
      },
    ]);
  }

  async function handleVideoUpload() {
    if (!user) return;
    const url = await uploadVideo('courses', user.id);
    if (url) setForm((f) => ({ ...f, videoUrl: url }));
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontFamily: font.bold, color: colors.text }]}>Courses</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAdd}>
          <Plus size={20} color="#fff" />
          <Text style={[styles.addBtnText, { fontFamily: font.semiBold }]}>Add Course</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={courses}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { fontFamily: font.semiBold, color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.rowSub, { fontFamily: font.regular, color: colors.textSec }]}>
                ₪{item.price} · {item.instructorName}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: item.published ? '#16a34a' : '#9ca3af' }]}>
              <Text style={styles.badgeText}>{item.published ? 'Live' : 'Draft'}</Text>
            </View>
            <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn}>
              <Pencil size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.iconBtn}>
              <Trash2 size={18} color="#dc2626" />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { fontFamily: font.regular, color: colors.textMuted }]}>
            No courses yet
          </Text>
        }
      />

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
            <TouchableOpacity activeOpacity={1}>
              <LinearGradient colors={['#1a237e', '#004aad']} style={styles.modal}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { fontFamily: font.bold }]}>
                    {editId ? 'Edit Course' : 'New Course'}
                  </Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <X size={22} color="#fff" />
                  </TouchableOpacity>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {([
                    { key: 'title', placeholder: 'Title', multiline: false },
                    { key: 'description', placeholder: 'Description', multiline: true },
                    { key: 'instructorName', placeholder: 'Instructor name', multiline: false },
                  ] as const).map(({ key, placeholder, multiline }) => (
                    <TextInput
                      key={key}
                      placeholder={placeholder}
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      value={String(form[key])}
                      onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
                      multiline={multiline}
                      numberOfLines={multiline ? 3 : 1}
                      style={[styles.input, { fontFamily: font.regular, height: multiline ? 80 : 48 }]}
                    />
                  ))}

                  <TextInput
                    placeholder="Price (₪)"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={form.price === 0 ? '' : String(form.price)}
                    onChangeText={(v) => setForm((f) => ({ ...f, price: parseFloat(v) || 0 }))}
                    keyboardType="numeric"
                    style={[styles.input, { fontFamily: font.regular, height: 48 }]}
                  />

                  <TouchableOpacity
                    style={[styles.uploadBtn, { opacity: uploading || processing ? 0.6 : 1 }]}
                    onPress={handleVideoUpload}
                    disabled={uploading || processing}
                  >
                    <Video size={18} color="#fff" />
                    <Text style={[styles.uploadBtnText, { fontFamily: font.semiBold }]}>
                      {uploading ? 'Uploading…' : processing ? 'Processing…' : form.videoUrl ? 'Replace Video' : 'Upload Video'}
                    </Text>
                  </TouchableOpacity>
                  {!!form.videoUrl && (
                    <Text style={[styles.videoUrl, { fontFamily: font.regular }]} numberOfLines={1}>
                      ✓ {form.videoUrl}
                    </Text>
                  )}

                  <View style={styles.toggleRow}>
                    <Text style={[styles.toggleLabel, { fontFamily: font.regular }]}>Published</Text>
                    <Switch
                      value={form.published}
                      onValueChange={(v) => setForm((f) => ({ ...f, published: v }))}
                      trackColor={{ true: '#16a34a', false: 'rgba(255,255,255,0.2)' }}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.saveBtn, { opacity: saving ? 0.6 : 1 }]}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    {saving ? <ActivityIndicator color="#fff" /> : (
                      <Text style={[styles.saveBtnText, { fontFamily: font.bold }]}>Save</Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </LinearGradient>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '700' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  addBtnText: { color: '#fff', fontSize: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 13, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  iconBtn: { padding: 6 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15 },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  modal: { width: 340, maxHeight: 600, borderRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    color: '#fff', marginBottom: 12, textAlignVertical: 'top',
  },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  uploadBtnText: { color: '#fff', fontSize: 14 },
  videoUrl: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  toggleLabel: { color: '#fff', fontSize: 15 },
  saveBtn: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#004aad', fontSize: 16, fontWeight: '700' },
});

import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
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

const CATEGORIES = Object.keys(CREW_CATEGORIES);

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
};

export function SubmitCourseModal({ visible, onClose, onSubmitted }: Props) {
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const user = useAuthStore((s) => s.user);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [courseUrl, setCourseUrl] = useState('');
  const [instructorName, setInstructorName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !category || !courseUrl.trim() || !instructorName.trim()) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'courseRequests'), {
        title: title.trim(),
        category,
        courseUrl: courseUrl.trim(),
        instructorName: instructorName.trim(),
        price: Number(price) || 0,
        description: description.trim(),
        submittedBy: user?.id ?? '',
        submittedByName: user?.displayName ?? '',
        createdAt: serverTimestamp(),
      });
      setTitle(''); setCategory(''); setCourseUrl('');
      setInstructorName(''); setPrice(''); setDescription('');
      onSubmitted();
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = title.trim() && category && courseUrl.trim() && instructorName.trim() && !isSubmitting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheetWrapper}>
          <LinearGradient colors={['#efd4f6', '#b7cae6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sheet}>
            {/* Header */}
            <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.headerTitle, { ...font.bold }]}>{t('courses.add_your_course')}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
                <X size={20} color="#004aad" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
              {/* Title */}
              <Text style={[styles.label, { ...font.semiBold }]}>{t('courses.course_title_label')} *</Text>
              <TextInput
                style={[styles.input, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
                value={title}
                onChangeText={setTitle}
                placeholder={t('courses.course_title_label')}
                placeholderTextColor="rgba(0,74,173,0.4)"
              />

              {/* Category */}
              <Text style={[styles.label, { ...font.semiBold }]}>{t('courses.course_category')} *</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowCategoryPicker(!showCategoryPicker)}
                activeOpacity={0.8}
              >
                <Text style={[{ color: category ? '#004aad' : 'rgba(0,74,173,0.4)', ...font.regular }]}>
                  {category || t('courses.select_category')}
                </Text>
              </TouchableOpacity>
              {showCategoryPicker && (
                <View style={styles.picker}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={styles.pickerItem}
                      onPress={() => { setCategory(cat); setShowCategoryPicker(false); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.pickerItemText, { ...font.regular }]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Link */}
              <Text style={[styles.label, { ...font.semiBold }]}>{t('courses.course_link')} *</Text>
              <TextInput
                style={[styles.input, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
                value={courseUrl}
                onChangeText={setCourseUrl}
                placeholder="https://..."
                placeholderTextColor="rgba(0,74,173,0.4)"
                autoCapitalize="none"
                keyboardType="url"
              />

              {/* Instructor */}
              <Text style={[styles.label, { ...font.semiBold }]}>{t('courses.instructor_label')} *</Text>
              <TextInput
                style={[styles.input, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
                value={instructorName}
                onChangeText={setInstructorName}
                placeholder={t('courses.instructor_label')}
                placeholderTextColor="rgba(0,74,173,0.4)"
              />

              {/* Price */}
              <Text style={[styles.label, { ...font.semiBold }]}>{t('courses.price_label')}</Text>
              <TextInput
                style={[styles.input, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
                value={price}
                onChangeText={setPrice}
                placeholder="0"
                placeholderTextColor="rgba(0,74,173,0.4)"
                keyboardType="numeric"
              />

              {/* Description */}
              <Text style={[styles.label, { ...font.semiBold }]}>{t('courses.description_label')}</Text>
              <TextInput
                style={[styles.input, styles.inputMulti, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('courses.description_label')}
                placeholderTextColor="rgba(0,74,173,0.4)"
                multiline
                numberOfLines={3}
              />

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
                activeOpacity={0.8}
              >
                {isSubmitting
                  ? <ActivityIndicator size="small" color="#ffffff" />
                  : <Text style={[styles.submitBtnText, { ...font.bold }]}>{t('courses.submit_course')}</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper: { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', maxHeight: '90%' },
  sheet: { flex: 1, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 32 },
  header: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { fontSize: 20, color: '#004aad', flex: 1 },
  form: { gap: 4, paddingBottom: 16 },
  label: { fontSize: 13, color: 'rgba(0,74,173,0.8)', marginBottom: 4, marginTop: 12 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderColor: 'rgba(0,74,173,0.2)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#004aad',
    fontSize: 14,
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  picker: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
  },
  pickerItem: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(0,74,173,0.1)' },
  pickerItemText: { color: '#004aad', fontSize: 14 },
  submitBtn: {
    backgroundColor: '#004aad',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#ffffff', fontSize: 15 },
});

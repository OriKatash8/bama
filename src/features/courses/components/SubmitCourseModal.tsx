import { useState, useRef } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, StyleSheet, useWindowDimensions, PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { uploadFile } from '@core/firebase/storage';
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
  const { height: screenHeight } = useWindowDimensions();
  const font = useAppFont();

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderRelease: (_, gs) => { if (gs.dy > 80) onClose(); },
    })
  ).current;
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
  const [coverImageUri, setCoverImageUri] = useState<string | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [durationHours, setDurationHours] = useState('');
  const [lessonsCount, setLessonsCount] = useState('');
  const [level, setLevel] = useState('');

  async function handlePickCover() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled) setCoverImageUri(result.assets[0].uri);
  }

  async function handleSubmit() {
    if (!title.trim() || !category || !courseUrl.trim() || !instructorName.trim()) return;
    setIsSubmitting(true);
    try {
      let coverImageUrl: string | undefined;
      if (coverImageUri) {
        setIsUploadingCover(true);
        const blob = await fetch(coverImageUri).then((r) => r.blob());
        coverImageUrl = await uploadFile(`course-images/${Date.now()}.jpg`, blob);
        setIsUploadingCover(false);
      }
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
        ...(coverImageUrl ? { coverImageUrl } : {}),
        ...(durationHours.trim() ? { durationHours: Number(durationHours) } : {}),
        ...(lessonsCount.trim() ? { lessonsCount: Number(lessonsCount) } : {}),
        ...(level ? { level } : {}),
      });
      setTitle(''); setCategory(''); setCourseUrl('');
      setInstructorName(''); setPrice(''); setDescription('');
      setCoverImageUri(null); setDurationHours(''); setLessonsCount(''); setLevel('');
      onSubmitted();
    } finally {
      setIsSubmitting(false);
      setIsUploadingCover(false);
    }
  }

  const canSubmit = title.trim() && category && courseUrl.trim() && instructorName.trim() && !isSubmitting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheetWrapper, { height: screenHeight * 0.88 }]}>
          <LinearGradient colors={['#efd4f6', '#b7cae6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sheet}>
            {/* Drag handle */}
            <View style={styles.dragHandleArea} {...panResponder.panHandlers}>
              <View style={styles.dragHandle} />
            </View>

            {/* Header */}
            <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.headerTitle, { ...font.bold }]}>{t('courses.add_your_course')}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
                <X size={20} color="#004aad" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form} style={{ flex: 1 }}>
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

              {/* Cover image */}
              <Text style={[styles.label, { ...font.semiBold }]}>{t('courses.cover_image_label')}</Text>
              <TouchableOpacity style={styles.coverPickerBtn} onPress={handlePickCover} activeOpacity={0.8}>
                {coverImageUri ? (
                  <Image source={{ uri: coverImageUri }} style={styles.coverPreview} contentFit="cover" />
                ) : (
                  <Text style={[styles.coverPickerText, { ...font.regular }]}>{t('courses.add_cover_image')}</Text>
                )}
              </TouchableOpacity>

              {/* Duration + lessons */}
              <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { ...font.semiBold }]}>{t('courses.duration_label')}</Text>
                  <TextInput
                    style={[styles.input, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
                    value={durationHours}
                    onChangeText={setDurationHours}
                    placeholder="0"
                    placeholderTextColor="rgba(0,74,173,0.4)"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { ...font.semiBold }]}>{t('courses.lessons_label')}</Text>
                  <TextInput
                    style={[styles.input, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
                    value={lessonsCount}
                    onChangeText={setLessonsCount}
                    placeholder="0"
                    placeholderTextColor="rgba(0,74,173,0.4)"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Level */}
              <Text style={[styles.label, { ...font.semiBold }]}>{t('courses.level_label')}</Text>
              <View style={[styles.levelRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                {(['level_beginner', 'level_intermediate', 'level_advanced'] as const).map((key) => {
                  const val = t(`courses.${key}`);
                  const active = level === val;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.levelBtn, active && styles.levelBtnActive]}
                      onPress={() => setLevel(active ? '' : val)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.levelBtnText, { ...font.semiBold }, active && styles.levelBtnTextActive]}>
                        {val}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitBtn, (!canSubmit || isUploadingCover) && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit || isUploadingCover}
                activeOpacity={0.8}
              >
                {isSubmitting
                  ? <ActivityIndicator size="small" color="#ffffff" />
                  : <Text style={[styles.submitBtnText, { ...font.bold }]}>{t('courses.submit_course')}</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper: { width: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheet: { flex: 1, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 32 },
  dragHandleArea: { alignItems: 'center', paddingVertical: 8 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.18)' },
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
  coverPickerBtn: {
    height: 90,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(0,74,173,0.3)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverPreview: { width: '100%', height: '100%' },
  coverPickerText: { color: 'rgba(0,74,173,0.5)', fontSize: 13 },
  levelRow: { gap: 8 },
  levelBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.3)',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  levelBtnActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  levelBtnText: { fontSize: 12, color: '#004aad' },
  levelBtnTextActive: { color: '#fff' },
});

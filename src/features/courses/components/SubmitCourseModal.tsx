import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native';
import { X } from 'lucide-react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import {
  CourseFormFields, EMPTY_COURSE_DRAFT, courseDraftComplete, uploadCourseCover, type CourseDraft,
} from './CourseFormFields';
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
  const align = { textAlign: rtl ? 'right' : 'left' } as const;

  const [draft, setDraft] = useState<CourseDraft>(EMPTY_COURSE_DRAFT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  async function handleSubmit() {
    if (!courseDraftComplete(draft)) return;
    const { title, category, courseUrl, instructorName, price, description, coverUri, durationHours, lessonsCount, level } = draft;
    setIsSubmitting(true);
    try {
      let coverImageUrl: string | undefined;
      if (coverUri) {
        setIsUploadingCover(true);
        coverImageUrl = await uploadCourseCover(coverUri);
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
      setDraft(EMPTY_COURSE_DRAFT);
      onSubmitted();
    } finally {
      setIsSubmitting(false);
      setIsUploadingCover(false);
    }
  }

  const canSubmit = courseDraftComplete(draft) && !isSubmitting;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Same shell as the marketplace filter popup: a plain overlay View with an
          absolute-fill dismiss layer behind a centred white card. The card must
          NOT be nested inside a TouchableOpacity — its `width: '100%'` would then
          resolve against a content-sized parent and collapse. */}
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
            {/* Header */}
            <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.headerTitle, { ...font.bold }, align]}>{t('courses.add_your_course')}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
                <X size={20} color={TEXT} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form} style={styles.formScroll}>
              <CourseFormFields value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />

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
        </View>
      </View>
    </Modal>
  );
}

// Black text; the fields' own look lives in CourseFormFields.
const TEXT = '#000000';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  header: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { fontSize: 18, color: TEXT, flex: 1 },
  form: { gap: 4, paddingBottom: 16 },
  // flexShrink, NOT flex:1. The card is auto-height capped at maxHeight, so a
  // flex:1 child has no basis to grow from and collapses to nothing — which left
  // the modal showing only its header. Same as the marketplace filter's scroll.
  formScroll: { flexShrink: 1 },
  submitBtn: {
    backgroundColor: '#004aad',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#ffffff', fontSize: 15, textAlign: 'center' },
});

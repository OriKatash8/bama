import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Star, User as UserIcon } from 'lucide-react-native';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    let str = typeof result === 'string' ? result : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) str = str.replace(`{{${k}}}`, v);
    }
    return str;
  };
}

export type ReviewProfessional = {
  id: string;
  displayName: string;
  photoURL: string | null;
  role: string;
};

type ReviewDraft = {
  rating: number;
  text: string;
};

type Props = {
  visible: boolean;
  projectId: string;
  clientId: string;
  clientDisplayName: string;
  professionals: ReviewProfessional[];
  onComplete: () => void;
};

export function ReviewFlow({
  visible,
  projectId,
  clientId,
  clientDisplayName,
  professionals,
  onComplete,
}: Props) {
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const font = useAppFont();
  const rtl = language === 'he';

  const [currentIndex, setCurrentIndex] = useState(0);
  const [drafts, setDrafts] = useState<ReviewDraft[]>(() =>
    professionals.map(() => ({ rating: 0, text: '' })),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(0);
      setDrafts(professionals.map(() => ({ rating: 0, text: '' })));
    }
  }, [visible, professionals.length]);

  console.log('[ReviewFlow] render — visible:', visible, 'professionals:', professionals.length);
  if (!visible || professionals.length === 0) return null;

  const current = professionals[currentIndex];
  const draft = drafts[currentIndex] ?? { rating: 0, text: '' };
  const isLast = currentIndex === professionals.length - 1;
  const canProceed = draft.rating >= 1 && draft.text.trim().length >= 10;

  function updateDraft(updates: Partial<ReviewDraft>) {
    setDrafts((prev) => {
      const next = [...prev];
      next[currentIndex] = { ...next[currentIndex], ...updates };
      return next;
    });
  }

  async function handleNext() {
    if (!canProceed || isSubmitting) return;
    if (!isLast) {
      setCurrentIndex((i) => i + 1);
      return;
    }

    setIsSubmitting(true);
    try {
      await Promise.all(
        professionals.map((prof, i) => {
          const d = drafts[i];
          return addDoc(collection(db, 'reviews'), {
            projectId,
            professionalId: prof.id,
            reviewerId: clientId,
            authorId: clientId,
            authorName: clientDisplayName,
            rating: d.rating,
            text: d.text,
            body: d.text,
            createdAt: serverTimestamp(),
          });
        }),
      );
      await updateDoc(doc(db, 'projects', projectId), {
        reviewsCompleted: true,
        reviewsPending: [],
      });
      onComplete();
    } catch {
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <LinearGradient
        colors={['#efd4f6', '#b7cae6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.root}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { ...font.bold }]}>
            {t('review.title')}
          </Text>

          <Text style={[styles.progress, { ...font.regular }]}>
            {t('review.progress', {
              current: String(currentIndex + 1),
              total: String(professionals.length),
            })}
          </Text>

          <View style={styles.card}>
            <View style={styles.avatarWrap}>
              {current.photoURL ? (
                <Image source={{ uri: current.photoURL }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <UserIcon size={32} color="#fff" strokeWidth={1.5} />
                </View>
              )}
            </View>

            <Text style={[styles.profName, { ...font.bold }]}>
              {current.displayName}
            </Text>
            <Text style={[styles.profRole, { ...font.regular }]}>
              {current.role}
            </Text>

            <View style={[styles.starsRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => updateDraft({ rating: star })}
                  activeOpacity={0.7}
                  hitSlop={6}
                >
                  <Star
                    size={40}
                    color="#FFD700"
                    fill={draft.rating >= star ? '#FFD700' : 'transparent'}
                    strokeWidth={1.5}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {draft.rating === 0 && (
              <Text style={[styles.hint, { ...font.regular, textAlign: 'center' }]}>
                {t('review.required_stars')}
              </Text>
            )}

            <TextInput
              style={[
                styles.textInput,
                { ...font.regular, textAlign: rtl ? 'right' : 'left' },
              ]}
              multiline
              value={draft.text}
              onChangeText={(v) => updateDraft({ text: v })}
              placeholder={t('review.placeholder')}
              placeholderTextColor="rgba(0,74,173,0.4)"
            />

            {draft.text.trim().length > 0 && draft.text.trim().length < 10 && (
              <Text
                style={[
                  styles.hint,
                  { ...font.regular, textAlign: rtl ? 'right' : 'left' },
                ]}
              >
                {t('review.required_text')}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.btn, !canProceed && styles.btnDisabled]}
            onPress={handleNext}
            disabled={!canProceed || isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={[styles.btnText, { ...font.bold }]}>
                {isLast ? t('review.submit') : t('review.next')}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'ios' ? 64 : 40,
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#004aad',
    textAlign: 'center',
    marginBottom: 4,
  },
  progress: {
    fontSize: 14,
    color: 'rgba(0,74,173,0.6)',
    textAlign: 'center',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  avatarWrap: { marginBottom: 4 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarFallback: {
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#004aad',
    textAlign: 'center',
  },
  profRole: {
    fontSize: 13,
    color: 'rgba(0,74,173,0.6)',
    textAlign: 'center',
    marginBottom: 4,
  },
  starsRow: {
    gap: 8,
    justifyContent: 'center',
    marginVertical: 4,
  },
  hint: { fontSize: 12, color: '#ef4444' },
  textInput: {
    width: '100%',
    minHeight: 100,
    borderRadius: 12,
    backgroundColor: '#f5f5f7',
    padding: 12,
    fontSize: 15,
    color: '#004aad',
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
    textAlignVertical: 'top',
  },
  btn: {
    backgroundColor: '#004aad',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { backgroundColor: 'rgba(0,74,173,0.3)' },
  btnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});

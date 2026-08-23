import { useState, useEffect } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator,
  Modal, TextInput, ScrollView, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Flag, X } from 'lucide-react-native';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Screen } from '@components/layout/Screen';
import { ProfileHeader } from '@features/profile/components/ProfileHeader';
import { BioSection } from '@features/profile/components/BioSection';
import { ContentTabs } from '@features/profile/components/ContentTabs';
import { PortfolioGrid } from '@features/profile/components/PortfolioGrid';
import { DirectProjectSheet } from '@features/projects/components/DirectProjectSheet';
import { getDocument, queryDocuments, queryByField } from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import { db } from '@core/firebase/config';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { useUiStore } from '@core/stores/uiStore';
import { useAuthStore } from '@core/stores/authStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { User, ProfessionalProfile } from '@core/types/user';
import type { MediaAsset } from '@core/types/media';
import type { Review } from '@core/types/project';

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

const MAX_EVIDENCE = 3;

export default function PublicProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const font = useAppFont();
  const { showToast } = useUiStore();
  const currentUserId = useAuthStore((s) => s.user?.id ?? '');
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const [sheetVisible, setSheetVisible] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfessionalProfile | null>(null);
  const [portfolio, setPortfolio] = useState<MediaAsset[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Report modal state
  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportEvidence, setReportEvidence] = useState<string[]>([]);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  useEffect(() => {
    if (!userId) return;

    void (async () => {
      try {
        const [userData, profileData, portfolioData, reviewData] = await Promise.all([
          getDocument<User>(`users/${userId}`),
          getDocument<ProfessionalProfile>(`users/${userId}/profile/data`),
          queryDocuments<MediaAsset>(`users/${userId}/portfolio`),
          queryByField<Review>('reviews', 'professionalId', userId),
        ]);

        setUser(userData);
        setProfile(profileData);
        setPortfolio(
          portfolioData.sort((a, b) => b.uploadedAt.seconds - a.uploadedAt.seconds)
        );
        setReviews(reviewData);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [userId]);

  function goToBrowse() {
    router.push(`/${modeSegment}/(tabs)/browse` as never);
  }

  async function pickEvidence() {
    if (reportEvidence.length >= MAX_EVIDENCE) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setReportEvidence((prev) => [...prev, result.assets[0].uri]);
    }
  }

  function removeEvidence(idx: number) {
    setReportEvidence((prev) => prev.filter((_, i) => i !== idx));
  }

  function closeReport() {
    setReportVisible(false);
    setReportReason('');
    setReportEvidence([]);
  }

  async function submitReport() {
    if (reportReason.trim().length < 20 || !userId || !currentUserId) return;
    setReportSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'reports'), {
        reporterId: currentUserId,
        reportedUserId: userId,
        reportedUserName: user?.displayName ?? '',
        reason: reportReason.trim(),
        evidenceURLs: [] as string[],
        status: 'pending' as const,
        createdAt: serverTimestamp(),
      });

      if (reportEvidence.length > 0) {
        const urls = await Promise.all(
          reportEvidence.map(async (uri, i) => {
            const response = await fetch(uri);
            const blob = await response.blob();
            const ext = uri.split('.').pop() ?? 'jpg';
            return uploadFile(`reports/${docRef.id}/evidence/${Date.now()}_${i}.${ext}`, blob);
          })
        );
        await updateDoc(doc(db, 'reports', docRef.id), { evidenceURLs: urls });
      }

      closeReport();
      showToast(t('report.success'), 'success');
    } catch {
      Alert.alert('Error', t('report.min_chars'));
    } finally {
      setReportSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <Screen scrollable={false} backgroundColor={colors.bg}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#cb6ce6" />
        </View>
      </Screen>
    );
  }

  if (!user || !profile) {
    return (
      <Screen scrollable={false} backgroundColor={colors.bg}>
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.textMuted }]}>Profile not found</Text>
          <TouchableOpacity onPress={goToBrowse} style={styles.backFallback} activeOpacity={0.7}>
            <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>← Go back</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  const roleSkills = profile.roleSkills ?? [];
  const canSubmit = reportReason.trim().length >= 20;

  return (
    <Screen scrollable style={styles.screenContent} backgroundColor={colors.bg}>
      {/* ── Title row: back + report ── */}
      <View style={styles.titleRow}>
        <TouchableOpacity
          onPress={goToBrowse}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={24} color="#004aad" strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => setReportVisible(true)} activeOpacity={0.7} hitSlop={8}>
          <Flag size={18} color="#ff4d6d" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* ── Profile header (avatar, name, rating) ── */}
      <ProfileHeader
        photoURL={user.photoURL ?? null}
        name={user.displayName}
        isEditing={false}
        reviews={reviews}
        size={130}
      />

      {/* ── Bio ── */}
      <BioSection bio={profile.bio} isEditing={false} />

      {/* ── Equipment / Reviews / Skills ── */}
      <ContentTabs
        equipment={profile.equipment}
        reviews={reviews}
        roleSkills={roleSkills}
        isEditing={false}
      />

      {/* ── Portfolio ── */}
      {portfolio.length > 0 && (
        <View style={styles.portfolioSection}>
          <PortfolioGrid assets={portfolio} isEditing={false} />
        </View>
      )}

      {/* ── Tell us about your project ── */}
      <TouchableOpacity
        style={styles.projectBtn}
        onPress={() => setSheetVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={[styles.projectBtnText, { ...font.bold }]}>
          {t('search.tell_us_about_project')}
        </Text>
      </TouchableOpacity>

      <View style={styles.bottomPad} />

      <DirectProjectSheet
        visible={sheetVisible}
        professionalId={userId ?? ''}
        professionalName={user?.displayName ?? ''}
        onClose={() => setSheetVisible(false)}
        onSubmitted={() => {
          setSheetVisible(false);
          showToast(t('builder.request_submitted'), 'success');
        }}
      />

      {/* ── Report Modal ── */}
      <Modal visible={reportVisible} transparent animationType="slide" onRequestClose={closeReport}>
        <View style={styles.modalOverlay}>
          <LinearGradient colors={['#1a237e', '#004aad']} style={styles.modalSheet}>
            {/* Header */}
            <View style={[styles.modalHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.modalTitle, { ...font.bold }]}>
                {t('report.title')}
              </Text>
              <TouchableOpacity onPress={closeReport} hitSlop={8} activeOpacity={0.7}>
                <X size={22} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Reporting name */}
            <Text style={[styles.modalSubtitle, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}>
              {t('report.reporting', { name: user.displayName })}
            </Text>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Reason label */}
              <Text style={[styles.modalLabel, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
                {t('report.reason_label')}
              </Text>

              {/* Reason input */}
              <TextInput
                style={[styles.reasonInput, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
                multiline
                value={reportReason}
                onChangeText={setReportReason}
                placeholder={t('report.reason_placeholder')}
                placeholderTextColor="rgba(255,255,255,0.45)"
                returnKeyType="default"
              />

              {/* Char hint */}
              {reportReason.length > 0 && reportReason.length < 20 && (
                <Text style={[styles.charHint, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}>
                  {t('report.min_chars')}
                </Text>
              )}

              {/* Evidence */}
              <TouchableOpacity
                style={[styles.evidenceBtn, { flexDirection: rtl ? 'row-reverse' : 'row', opacity: reportEvidence.length >= MAX_EVIDENCE ? 0.4 : 1 }]}
                onPress={pickEvidence}
                disabled={reportEvidence.length >= MAX_EVIDENCE}
                activeOpacity={0.7}
              >
                <Text style={[styles.evidenceBtnText, { ...font.semiBold }]}>
                  {t('report.add_evidence')}
                </Text>
              </TouchableOpacity>

              {reportEvidence.length > 0 && (
                <View style={styles.thumbRow}>
                  {reportEvidence.map((uri, idx) => (
                    <View key={idx} style={styles.thumbWrap}>
                      <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                      <TouchableOpacity style={styles.thumbRemove} onPress={() => removeEvidence(idx)} hitSlop={4}>
                        <X size={12} color="#fff" strokeWidth={2.5} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, { opacity: canSubmit && !reportSubmitting ? 1 : 0.45 }]}
              onPress={submitReport}
              disabled={!canSubmit || reportSubmitting}
              activeOpacity={0.8}
            >
              {reportSubmitting ? (
                <ActivityIndicator size="small" color="#004aad" />
              ) : (
                <Text style={[styles.submitBtnText, { ...font.bold }]}>
                  {t('report.submit')}
                </Text>
              )}
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { gap: 24, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { fontSize: 16, fontWeight: '500' },
  backFallback: { paddingVertical: 8 },

  titleRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { paddingHorizontal: 4 },

  portfolioSection: {},

  projectBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004aad',
    borderRadius: 12,
    height: 54,
    marginTop: 24,
  },
  projectBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Montserrat-Regular',
  },

  bottomPad: { height: 40 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  modalHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  modalSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 20,
  },
  modalScroll: { flexGrow: 0 },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  reasonInput: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 12,
    minHeight: 120,
    color: '#fff',
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 6,
  },
  charHint: {
    fontSize: 12,
    color: '#ffb347',
    marginBottom: 12,
  },
  evidenceBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    gap: 6,
  },
  evidenceBtnText: {
    color: '#fff',
    fontSize: 14,
  },
  thumbRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ff4d6d',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  submitBtnText: {
    color: '#004aad',
    fontSize: 16,
    fontWeight: '700',
  },
});

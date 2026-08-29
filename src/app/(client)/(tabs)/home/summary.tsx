import { useState, useEffect, useMemo } from 'react';
import {
  ScrollView, StyleSheet, View, Text, TextInput, TouchableOpacity, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@components/layout/Screen';
import { MiniCalendar } from '@features/crew/components';
import { useCrewBuilder, useProjectRequests } from '@features/crew/hooks';
import { queryDocuments, getDocument } from '@core/firebase/firestore';
import { roleIdForCategory, professionalMatchesSlot, capabilityLabel, type RoleSkillEntry } from '@features/noticeboard/matching';
import { ROLE_BY_ID, labelOf } from '@features/crew/data/categories';
import { confirmDialog } from '@utils/confirmDialog';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { CalendarDays, ChevronLeft, X } from 'lucide-react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { ROLE_QUESTIONS, questionLabel } from '@features/projects/constants/roleQuestions';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

export default function SummaryScreen() {
  const params = useLocalSearchParams<{
    title: string;
    description: string;
    exec: string;
    deadline: string;
    location: string;
    projectId: string;
    slots: string;
    roleAnswers: string;
  }>();

  const { slots, removeCategory, reset: resetSlots, loadSlots } = useCrewBuilder();

  useEffect(() => {
    if (params.slots) {
      try { loadSlots(JSON.parse(params.slots)); } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { submit, updateProject } = useProjectRequests();
  const { showToast, notifyProjectSubmitted } = useUiStore();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';
  const font = useAppFont();

  const isEditMode = !!params.projectId;

  const [title, setTitle] = useState(params.title ?? '');
  const [description, setDescription] = useState(params.description ?? '');
  const [exec, setExec] = useState(params.exec ?? '');
  const [deadline, setDeadline] = useState(params.deadline ?? '');
  const [location, setLocation] = useState(params.location ?? '');
  const [calOpen, setCalOpen] = useState<'exec' | 'deadline' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedRoleAnswers = useMemo<Record<string, Record<string, string>>>(() => {
    try { return JSON.parse(params.roleAnswers || '{}'); } catch { return {}; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canConfirm = !isSubmitting && !!deadline && slots.length > 0;

  async function handleConfirm() {
    if (!canConfirm) return;
    setIsSubmitting(true);

    // Non-blocking warning when a required capability has few (<3) matching pros.
    const specialized = slots.filter((s) => s.requiredCapability);
    if (specialized.length > 0) {
      try {
        const users = await queryDocuments<{ id: string }>('users');
        const profiles = await Promise.all(
          users.map((u) =>
            getDocument<{ roleSkills?: RoleSkillEntry[] }>(
              `users/${u.id}/profile/data`,
            ),
          ),
        );
        const proRoleSkills = profiles
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => p.roleSkills ?? []);
        const scarce = specialized.filter(
          (slot) => proRoleSkills.filter((rsk) => professionalMatchesSlot(rsk, slot)).length < 3,
        );
        if (scarce.length > 0) {
          const list = scarce
            .map((s) => {
              const role = ROLE_BY_ID[roleIdForCategory(s.category)];
              const roleLabel = role ? labelOf(role, lang) : s.category;
              return `${roleLabel} · ${capabilityLabel(s.category, s.requiredCapability, lang)}`;
            })
            .join(', ');
          const ok = await confirmDialog(
            t('builder.few_matches_title'),
            t('builder.few_matches_msg').replace('{{list}}', list),
          );
          if (!ok) { setIsSubmitting(false); return; }
        }
      } catch {
        // A scan failure must not block posting.
      }
    }

    const details = {
      title,
      description: description || undefined,
      exec: exec || undefined,
      deadline,
      location,
      roleAnswers: Object.keys(parsedRoleAnswers).length > 0 ? parsedRoleAnswers : undefined,
    };
    try {
      if (isEditMode) {
        await updateProject(params.projectId, slots, details);
      } else {
        await submit(slots, details);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[submit] Firestore write failed:', msg);
      showToast(msg || t('builder.failed_submit'), 'error');
      setIsSubmitting(false);
      return;
    }
    // Firestore write succeeded — navigate outside the try so navigation errors don't look like write failures
    if (isEditMode) {
      resetSlots();
      notifyProjectSubmitted(); // clear the Home builder form + drop edit context
      showToast(t('builder.project_updated'), 'success');
      router.navigate('/(client)/(tabs)/home' as never);
    } else {
      resetSlots();
      notifyProjectSubmitted(); // tell the Home builder to clear its form
      showToast(t('builder.submitted'), 'success');
      router.navigate('/(client)/(tabs)/chats' as never);
    }
  }

  /** "General" label for a slot with no requiredCapability. */
  const generalLabel = rtl ? 'כללי' : 'General';

  return (
    <Screen scrollable={false}>
      {/* Back button */}
      <TouchableOpacity
        style={[styles.backRow, { flexDirection: rtl ? 'row-reverse' : 'row', alignSelf: rtl ? 'flex-end' : 'flex-start' }]}
        onPress={() => router.back()}
        activeOpacity={0.7}
        hitSlop={12}
      >
        <ChevronLeft size={20} color="#004aad" strokeWidth={2} />
        <Text style={[styles.backText, { ...font.semiBold }]}>{t('builder.back_to_edit')}</Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={['#efd4f6', '#b7cae6']} style={styles.card}>
          <Text style={[styles.cardTitle, { ...font.bold, textAlign: rtl ? 'right' : 'left' }]}>
            {t('builder.summary_title')}
          </Text>

          {/* Title */}
          <Text style={[styles.fieldLabel, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
            {t('builder.confirm_title')}
          </Text>
          <TextInput
            style={[styles.input, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
            value={title}
            onChangeText={setTitle}
            placeholder={t('builder.confirm_title')}
            placeholderTextColor="#004aad99"
          />
          {/* Description (read-only, only shown for projects that have one) */}
          {description.length > 0 && (
            <>
              <Text style={[styles.fieldLabel, { ...font.semiBold, textAlign: rtl ? 'right' : 'left', marginTop: 14 }]}>
                {t('builder.tell_us')}
              </Text>
              <Text style={[styles.input, { ...font.regular, textAlign: rtl ? 'right' : 'left', color: '#004aad' }]}>
                {description}
              </Text>
            </>
          )}

          {/* Dates */}
          <View style={styles.dateRow}>
            <View style={styles.dateCol}>
              <Text style={[styles.fieldLabel, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
                {t('builder.execution')}{' '}
                <Text style={{ fontWeight: '400', opacity: 0.6 }}>({t('builder.optional')})</Text>
              </Text>
              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => setCalOpen('exec')}
                activeOpacity={0.8}
              >
                <Text style={[styles.dateBtnText, { ...font.regular, color: exec ? '#004aad' : '#004aad99' }]} numberOfLines={1}>
                  {exec || t('builder.placeholder_date')}
                </Text>
                <CalendarDays size={14} color="#cb6ce6" strokeWidth={1.8} />
              </TouchableOpacity>
            </View>

            <View style={styles.dateCol}>
              <Text style={[styles.fieldLabel, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
                {t('builder.deadline')}
              </Text>
              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => setCalOpen('deadline')}
                activeOpacity={0.8}
              >
                <Text style={[styles.dateBtnText, { ...font.regular, color: deadline ? '#004aad' : '#004aad99' }]} numberOfLines={1}>
                  {deadline === 'flexible' ? t('builder.flexible') : (deadline || t('builder.placeholder_deadline'))}
                </Text>
                <CalendarDays size={14} color="#cb6ce6" strokeWidth={1.8} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Location */}
          <Text style={[styles.fieldLabel, { ...font.semiBold, textAlign: rtl ? 'right' : 'left', marginTop: 14 }]}>
            {t('builder.location')}
          </Text>
          <TextInput
            style={[styles.input, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
            value={location}
            onChangeText={setLocation}
            placeholder={t('builder.placeholder_location')}
            placeholderTextColor="#004aad99"
          />

          {/* Role answers */}
          {Object.keys(parsedRoleAnswers).length > 0 && (
            <>
              <Text style={[styles.fieldLabel, { ...font.semiBold, textAlign: rtl ? 'right' : 'left', marginTop: 14 }]}>
                {rtl ? 'פרטי הפרויקט' : 'Project Details'}
              </Text>
              {Object.entries(parsedRoleAnswers).map(([roleKey, answers]) => {
                const questions = ROLE_QUESTIONS[roleKey];
                if (!questions) return null;
                return (
                  <View key={roleKey} style={{ marginBottom: 12 }}>
                    <Text style={[styles.hint, { ...font.semiBold, color: '#004aad', opacity: 1, marginBottom: 4, textAlign: rtl ? 'right' : 'left' }]}>
                      {roleKey}
                    </Text>
                    {questions.map(q => {
                      const value = answers[q.id];
                      if (!value) return null;
                      return (
                        <View key={q.id} style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 6, marginBottom: 2 }}>
                          <Text style={[styles.hint, { ...font.regular, textAlign: rtl ? 'right' : 'left', flex: 1 }]}>
                            {questionLabel(q, rtl)}:
                          </Text>
                          <Text style={[styles.hint, { ...font.semiBold, color: '#004aad', opacity: 1, textAlign: rtl ? 'right' : 'left' }]}>
                            {value}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </>
          )}

          {/* Slots */}
          <Text style={[styles.fieldLabel, { ...font.semiBold, textAlign: rtl ? 'right' : 'left', marginTop: 14 }]}>
            {t('builder.select_roles')}
          </Text>
          {[...new Set(slots.map((s) => s.category))].map((category) => {
            const role = ROLE_BY_ID[roleIdForCategory(category)];
            const roleLabel = role ? labelOf(role, lang) : category;
            const breakdown = slots
              .filter((s) => s.category === category)
              .map((s) =>
                `${s.quantity} ${s.requiredCapability ? capabilityLabel(s.category, s.requiredCapability, lang) : generalLabel}`,
              )
              .join(' · ');
            return (
              <View key={category} style={styles.slotRow}>
                <View style={styles.slotInfo}>
                  <Text style={[styles.slotSub, { ...font.semiBold }]}>{roleLabel}</Text>
                  <Text style={[styles.slotCap, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}>
                    {breakdown}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeCategory(category)}
                  hitSlop={8}
                  activeOpacity={0.7}
                >
                  <X size={14} color="#e53935" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            );
          })}
          {slots.length === 0 && (
            <Text style={[styles.hint, { ...font.regular, color: '#e53935', textAlign: rtl ? 'right' : 'left' }]}>
              {t('builder.error_role')}
            </Text>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              { marginTop: 24 },
              !canConfirm && styles.submitBtnDisabled,
              Platform.OS === 'web' && canConfirm
                ? ({ background: 'linear-gradient(to right, #004aad, #cb6ce6)' } as object)
                : undefined,
            ]}
            onPress={() => void handleConfirm()}
            disabled={!canConfirm}
            activeOpacity={0.8}
          >
            <Text style={[styles.submitText, { ...font.bold }]}>
              {isSubmitting
                ? t('builder.submitting')
                : isEditMode
                  ? t('builder.save_changes')
                  : t('builder.confirm_submit')}
            </Text>
          </TouchableOpacity>
        </LinearGradient>
      </ScrollView>

      {calOpen !== null && (
        <MiniCalendar
          value={calOpen === 'exec' ? exec : (deadline === 'flexible' ? '' : deadline)}
          onSelect={(d) => {
            if (calOpen === 'exec') setExec(d);
            else setDeadline(d);
            setCalOpen(null);
          }}
          onClose={() => setCalOpen(null)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 60 },

  backRow: { alignItems: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 16 },
  backText: { fontSize: 15, color: '#004aad', fontWeight: '600' },

  card: { borderRadius: 20, padding: 20, margin: 4 },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#004aad', marginBottom: 16 },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#004aad',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#004aad',
  },
  multiline: { height: 80, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: '#004aad', marginTop: 4, opacity: 0.8 },

  dateRow: { flexDirection: 'row', gap: 16, marginTop: 6 },
  dateCol: { flex: 1 },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  dateBtnText: { fontSize: 13, flex: 1 },

  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,74,173,0.1)',
  },
  slotInfo: { flex: 1 },
  slotSub: { fontSize: 14, fontWeight: '600', color: '#004aad' },
  slotCap: { fontSize: 12, color: '#7b2fa8', marginTop: 2 },
  slotCat: { fontSize: 12, color: '#004aad', marginTop: 1 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#004aad33',
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnAdd: { borderColor: '#004aad', backgroundColor: '#004aad22' },
  qtyBtnText: { fontSize: 16, lineHeight: 18, fontWeight: '700', color: '#004aad' },
  qtyBtnAddText: { color: '#004aad' },
  qtyBadge: {
    minWidth: 26, height: 26, borderRadius: 13,
    backgroundColor: '#004aad',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  qtyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  removeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  submitBtn: {
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#555' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },

});

import { useState, useEffect, useMemo } from 'react';
import {
  ScrollView, StyleSheet, View, Text, TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { Screen } from '@components/layout/Screen';
import { useCrewBuilder, useProjectRequests } from '@features/crew/hooks';
import { queryDocuments, getDocument } from '@core/firebase/firestore';
import { roleIdForCategory, professionalMatchesSlot, capabilityLabel, type RoleSkillEntry } from '@features/noticeboard/matching';
import { ROLE_BY_ID, labelOf } from '@features/crew/data/categories';
import { confirmDialog } from '@utils/confirmDialog';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { CalendarCheck, CalendarDays, ChevronLeft, MapPin, Users, X } from 'lucide-react-native';
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

/** The tabs layout zeroes the safe-area context for its screens, so the real
 *  bottom inset has to come from the window metrics (same as ChatRoomScreen). */
const BOTTOM_INSET = initialWindowMetrics?.insets.bottom ?? 0;

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
  const { showToast, notifyProjectSubmitted, requestBuilderStep } = useUiStore();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';
  const colors = useTheme();
  const font = useAppFont();

  const isEditMode = !!params.projectId;

  // Read-only view of the draft — editing happens back in the wizard.
  const title = params.title ?? '';
  const description = params.description ?? '';
  const exec = params.exec ?? '';
  const deadline = params.deadline ?? '';
  const location = params.location ?? '';
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedRoleAnswers = useMemo<Record<string, Record<string, string>>>(() => {
    try { return JSON.parse(params.roleAnswers || '{}'); } catch { return {}; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canConfirm = !isSubmitting && !!deadline && slots.length > 0;
  const totalPeople = slots.reduce((sum, s) => sum + s.quantity, 0);
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const textAlign = rtl ? 'right' : ('left' as const);

  /** Pop back to the wizard (still mounted, so the draft survives) at a step. */
  function editStep(step: 1 | 2 | 3) {
    requestBuilderStep(step);
    router.back();
  }

  async function confirmRemoveCategory(category: string) {
    const ok = await confirmDialog(t('builder.remove_role_title'), t('builder.remove_role_msg'));
    if (ok) removeCategory(category);
  }

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

  // Text on this screen is brand blue: full strength for values and titles,
  // muted blue for labels so the hierarchy still reads.
  const BLUE = '#004aad';
  const BLUE_MUTED = 'rgba(0,74,173,0.55)';
  const BLUE_FAINT = 'rgba(0,74,173,0.4)';

  /** A missing value never shows a form placeholder — it says so plainly. */
  function renderValue(value: string, style?: object) {
    const empty = !value;
    return (
      <Text
        style={[
          styles.value,
          { ...font.regular, textAlign, color: empty ? BLUE_FAINT : BLUE },
          empty && styles.valueEmpty,
          style,
        ]}
      >
        {empty ? t('builder.not_specified') : value}
      </Text>
    );
  }

  /** Section header: title at the start, an optional edit link to its wizard step. */
  function renderCardHeader(label: string, step?: 1 | 2 | 3) {
    return (
      <View style={[styles.cardHeader, { flexDirection: rowDir }]}>
        <Text style={[styles.cardTitle, { ...font.medium, color: BLUE, textAlign }]}>
          {label}
        </Text>
        {step !== undefined && (
          <TouchableOpacity onPress={() => editStep(step)} hitSlop={10} activeOpacity={0.7}>
            <Text style={[styles.editLink, { ...font.medium }]}>{t('builder.edit')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  /** One "when & where" row: icon + label, value at the end. */
  function renderMetaRow(
    Icon: typeof CalendarDays,
    label: string,
    value: string,
    chip = false,
  ) {
    return (
      <View style={[styles.metaRow, { flexDirection: rowDir }]}>
        <Icon size={17} color={BLUE_MUTED} strokeWidth={1.8} />
        <Text style={[styles.metaLabel, { ...font.regular, color: BLUE_MUTED, textAlign }]}>
          {label}
        </Text>
        {chip ? (
          <View style={styles.chip}>
            <Text style={[styles.chipText, { ...font.medium }]}>{value}</Text>
          </View>
        ) : (
          renderValue(value, styles.metaValue)
        )}
      </View>
    );
  }

  return (
    <Screen scrollable={false} backgroundColor={colors.bg}>
      {/* Back */}
      <TouchableOpacity
        style={[styles.backRow, { flexDirection: rowDir, alignSelf: rtl ? 'flex-end' : 'flex-start' }]}
        onPress={() => router.back()}
        activeOpacity={0.7}
        hitSlop={12}
      >
        <ChevronLeft
          size={20}
          color="#004aad"
          strokeWidth={2}
          style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}
        />
        <Text style={[styles.backText, { ...font.semiBold }]}>{t('builder.back_to_edit')}</Text>
      </TouchableOpacity>

      {/* Title + subtitle */}
      <View style={styles.headerBlock}>
        <Text style={[styles.screenTitle, { ...font.medium, textAlign }]}>
          {t('builder.summary_title')}
        </Text>
        <Text style={[styles.screenSubtitle, { ...font.regular, color: BLUE_MUTED, textAlign }]}>
          {t('builder.summary_subtitle')}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Card 1: project details ── */}
        <View style={styles.card}>
          {renderCardHeader(t('builder.section_project'), 1)}

          <Text style={[styles.fieldLabel, { ...font.regular, color: BLUE_MUTED, textAlign }]}>
            {t('builder.title')}
          </Text>
          {renderValue(title)}

          <Text style={[styles.fieldLabel, { ...font.regular, color: BLUE_MUTED, textAlign, marginTop: 10 }]}>
            {t('builder.description')}
          </Text>
          {renderValue(description, styles.description)}
        </View>

        {/* ── Card 2: when & where ── */}
        <View style={styles.card}>
          {renderCardHeader(t('builder.section_when_where'), 1)}
          {renderMetaRow(CalendarDays, t('builder.execution'), exec)}
          {renderMetaRow(
            CalendarCheck,
            t('builder.deadline'),
            deadline === 'flexible' ? t('builder.flexible') : deadline,
            deadline === 'flexible',
          )}
          {renderMetaRow(MapPin, t('builder.location'), location)}
        </View>

        {/* ── Card 3: crew ── */}
        <View style={styles.card}>
          {renderCardHeader(`${t('builder.section_crew')} · ${totalPeople}`, 2)}

          {[...new Set(slots.map((s) => s.category))].map((category, i, arr) => {
            const role = ROLE_BY_ID[roleIdForCategory(category)];
            const roleLabel = role ? labelOf(role, lang) : category;
            const forCategory = slots.filter((s) => s.category === category);
            const breakdown = forCategory
              .map((s) => {
                const cap = s.requiredCapability
                  ? capabilityLabel(s.category, s.requiredCapability, lang)
                  : generalLabel;
                return `${cap} · ${s.quantity} ${t('builder.people_suffix')}`;
              })
              .join(' · ');
            return (
              <View
                key={category}
                style={[
                  styles.crewRow,
                  { flexDirection: rowDir },
                  i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
              >
                <View style={styles.crewIcon}>
                  <Users size={16} color="#004aad" strokeWidth={2} />
                </View>
                <View style={styles.crewText}>
                  <Text style={[styles.crewRole, { ...font.medium, color: BLUE, textAlign }]}>
                    {roleLabel}
                  </Text>
                  <Text style={[styles.crewMeta, { ...font.regular, color: BLUE_MUTED, textAlign }]}>
                    {breakdown}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => void confirmRemoveCategory(category)}
                  hitSlop={10}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('builder.remove_role_title')}
                >
                  <X size={16} color="#9aa0b8" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            );
          })}

          {slots.length === 0 && (
            <Text style={[styles.error, { ...font.regular, textAlign }]}>
              {t('builder.error_role')}
            </Text>
          )}
        </View>

        {/* ── Role answers (only for projects that carry them) ── */}
        {Object.keys(parsedRoleAnswers).length > 0 && (
          <View style={styles.card}>
            {renderCardHeader(t('builder.section_role_details'))}
            {Object.entries(parsedRoleAnswers).map(([roleKey, answers]) => {
              const questions = ROLE_QUESTIONS[roleKey];
              if (!questions) return null;
              return (
                <View key={roleKey} style={{ marginBottom: 8 }}>
                  <Text style={[styles.fieldLabel, { ...font.regular, color: BLUE_MUTED, textAlign }]}>
                    {roleKey}
                  </Text>
                  {questions.map((q) => {
                    const value = answers[q.id];
                    if (!value) return null;
                    return (
                      <View key={q.id} style={[styles.metaRow, { flexDirection: rowDir }]}>
                        <Text style={[styles.metaLabel, { ...font.regular, color: BLUE_MUTED, textAlign }]}>
                          {questionLabel(q, rtl)}
                        </Text>
                        {renderValue(value, styles.metaValue)}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Pinned publish bar — the tab bar is hidden on this route ── */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.publishBtn, !canConfirm && styles.publishBtnDisabled]}
          onPress={() => void handleConfirm()}
          disabled={!canConfirm}
          activeOpacity={0.85}
        >
          <Text style={[styles.publishText, { ...font.medium }]}>
            {isSubmitting
              ? t('builder.submitting')
              : isEditMode
                ? t('builder.save_changes')
                : t('builder.publish_project')}
          </Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 16 },

  backRow: { alignItems: 'center', gap: 4, paddingTop: 12, paddingHorizontal: 16 },
  backText: { fontSize: 15, color: '#004aad' },

  headerBlock: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 },
  screenTitle: { fontSize: 19, fontWeight: '500', color: '#004aad' },
  screenSubtitle: { fontSize: 12, marginTop: 2 },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 13,
    marginBottom: 10,
  },
  cardHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 13, fontWeight: '500', flex: 1 },
  editLink: { fontSize: 12, color: '#004aad' },

  fieldLabel: { fontSize: 11 },
  value: { fontSize: 14, marginTop: 2 },
  valueEmpty: { opacity: 0.7 },
  description: { lineHeight: 20 },

  metaRow: { alignItems: 'center', gap: 8, paddingVertical: 7 },
  metaLabel: { fontSize: 11, flex: 1 },
  metaValue: { fontSize: 13, marginTop: 0 },

  chip: {
    backgroundColor: '#eceef3',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipText: { fontSize: 12, color: '#9aa0b8' },

  crewRow: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  crewIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(0,74,173,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crewText: { flex: 1 },
  crewRole: { fontSize: 13 },
  crewMeta: { fontSize: 11, marginTop: 1 },

  error: { fontSize: 12, color: '#e53935', paddingVertical: 4 },

  footer: {
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 14 + BOTTOM_INSET,
  },
  publishBtn: {
    backgroundColor: '#004aad',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  publishBtnDisabled: { opacity: 0.4 },
  publishText: { color: '#ffffff', fontSize: 14, fontWeight: '500' },
});

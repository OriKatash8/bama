import { useState, useEffect, useMemo } from 'react';
import {
  Pressable, ScrollView, StyleSheet, View, Text, TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { Screen } from '@components/layout/Screen';
import { GradientBand } from '@components/ui/GradientBand';
import { useCrewBuilder, useProjectRequests } from '@features/crew/hooks';
import { queryDocuments, getDocument } from '@core/firebase/firestore';
import { roleIdForCategory, professionalMatchesSlot, capabilityLabel, type RoleSkillEntry } from '@features/noticeboard/matching';
import { ROLE_BY_ID, labelOf } from '@features/crew/data/categories';
import { CATEGORIES } from '@features/crew/data/roleTiles';
import { confirmDialog } from '@utils/confirmDialog';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { ROLE_QUESTIONS, questionLabel } from '@features/projects/constants/roleQuestions';
import { formatIsoDay } from '@utils/formatters';

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

const PAGE_BG = '#FAFAFC';
const VIOLET = '#6D28D9';
const VIOLET_DEEP = '#4C1D95';
const MUTED = '#8B8898';
const EMPTY = '#B4B1BF';
const HAIRLINE = '#F2F0F7';
/** Label column of the one-line field rows. 84, not 74: English "Project name"
 *  is 81pt at 12pt. The same in both languages so the rows line up. */
const LABEL_WIDTH = 84;

/** Flat role mark (black on transparency, tinted in code), by stored category. */
const GLYPH_BY_CATEGORY: Record<string, ReturnType<typeof require>> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.glyph]),
);

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
    backToWizard();
  }

  /**
   * Back to the wizard. Normally it's right under this screen in the home stack,
   * still mounted, so the draft survives. But when this page is the FIRST screen
   * (a web refresh, or opened from its URL), there's nothing to go back to and
   * router.back() throws "The action 'GO_BACK' was not handled by any navigator".
   * Then open the wizard instead; the requested step is still honoured.
   */
  function backToWizard() {
    if (router.canGoBack()) router.back();
    else router.replace('/(client)/(tabs)/home' as never);
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

  /** A divider between rows, inset 14 on both sides. */
  const divider = <View style={styles.divider} />;

  /** The value side of a field row. A missing value says so plainly, in a
   *  lighter weight and colour, so it reads as missing rather than filled. */
  function renderValue(value: string) {
    const empty = !value;
    return (
      <Text
        style={[
          styles.value,
          empty ? { ...font.regular, ...styles.valueEmpty } : font.forText(value, 'semiBold'),
          { textAlign },
        ]}
      >
        {empty ? t('builder.not_specified') : value}
      </Text>
    );
  }

  /** One field: label in a fixed column, value beside it on the same line. */
  function renderField(label: string, value: string) {
    return (
      <View style={[styles.fieldRow, { flexDirection: rowDir }]}>
        <Text style={[styles.fieldLabel, { ...font.regular, textAlign }]}>{label}</Text>
        {renderValue(value)}
      </View>
    );
  }

  /** Rows with a divider between them, none after the last. */
  function withDividers(rows: React.ReactNode[]) {
    return rows.map((row, i) => (
      <View key={i}>
        {i > 0 && divider}
        {row}
      </View>
    ));
  }

  /** Card header: title (and an optional count) at the start, an optional
   *  secondary edit button opposite, then a divider before the content. */
  function renderCardHeader(label: string, step?: 1 | 2 | 3, count?: number) {
    return (
      <>
        <View style={[styles.cardHeader, { flexDirection: rowDir }]}>
          <View style={[styles.cardTitleRow, { flexDirection: rowDir }]}>
            <Text style={[styles.cardTitle, font.forText(label, 'bold'), { textAlign }]}>{label}</Text>
            {count !== undefined && (
              <Text style={[styles.cardCount, font.regular]}>{count}</Text>
            )}
          </View>
          {step !== undefined && (
            <TouchableOpacity
              onPress={() => editStep(step)}
              hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
              activeOpacity={0.7}
              style={[styles.editBtn, { flexDirection: rowDir }]}
              accessibilityRole="button"
            >
              <Pencil size={12} color={VIOLET_DEEP} strokeWidth={2.2} />
              <Text style={[styles.editBtnText, font.semiBold]}>{t('builder.edit')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {divider}
      </>
    );
  }

  const crewCategories = [...new Set(slots.map((s) => s.category))];

  return (
    <Screen scrollable={false} backgroundColor={PAGE_BG}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Band: back link, title, subtitle ── */}
        <GradientBand style={styles.band}>
          <TouchableOpacity
            style={[styles.backRow, { flexDirection: rowDir, alignSelf: rtl ? 'flex-end' : 'flex-start' }]}
            onPress={backToWizard}
            activeOpacity={0.7}
            hitSlop={13}
          >
            {/* Points back out of the flow: › in Hebrew, ‹ in English. */}
            {rtl
              ? <ChevronRight size={15} color="rgba(255,255,255,0.9)" strokeWidth={2.4} />
              : <ChevronLeft size={15} color="rgba(255,255,255,0.9)" strokeWidth={2.4} />}
            <Text style={[styles.backText, font.semiBold]}>{t('builder.back_to_edit')}</Text>
          </TouchableOpacity>

          <Text
            style={[styles.screenTitle, extraBold(font.forText(t('builder.summary_title'), 'bold')), { textAlign }]}
          >
            {t('builder.summary_title')}
          </Text>
          <Text style={[styles.screenSubtitle, font.regular, { textAlign }]}>
            {t('builder.summary_subtitle')}
          </Text>
        </GradientBand>

        <View style={styles.sheet}>
          {/* ── Card 1: project details ── */}
          <View style={styles.card}>
            {renderCardHeader(t('builder.section_project'), 1)}
            {withDividers([
              renderField(t('builder.title'), title),
              renderField(t('builder.description'), description),
            ])}
          </View>

          {/* ── Card 2: when & where. A "flexible" deadline is the deadline's
              value, so it sits in the deadline row as plain text. ── */}
          <View style={styles.card}>
            {renderCardHeader(t('builder.section_when_where'), 1)}
            {withDividers([
              renderField(t('builder.execution'), formatIsoDay(exec)),
              renderField(
                t('builder.deadline'),
                deadline === 'flexible' ? t('builder.flexible') : formatIsoDay(deadline),
              ),
              renderField(t('builder.location'), location),
            ])}
          </View>

          {/* ── Card 3: crew ── */}
          <View style={styles.card}>
            {renderCardHeader(t('builder.section_crew'), 2, totalPeople)}

            {withDividers(crewCategories.map((category) => {
              const role = ROLE_BY_ID[roleIdForCategory(category)];
              const roleLabel = role ? labelOf(role, lang) : category;
              const glyph = GLYPH_BY_CATEGORY[category];
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
                <View key={category} style={[styles.crewRow, { flexDirection: rowDir }]}>
                  <View style={styles.crewIcon}>
                    {glyph ? (
                      <Image source={glyph} style={styles.crewGlyph} contentFit="contain" tintColor={VIOLET} />
                    ) : null}
                  </View>
                  <View style={styles.crewText}>
                    <Text style={[styles.crewRole, font.forText(roleLabel, 'semiBold'), { textAlign }]}>
                      {roleLabel}
                    </Text>
                    <Text style={[styles.crewMeta, font.regular, { textAlign }]}>
                      {breakdown}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => void confirmRemoveCategory(category)}
                    hitSlop={15}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('builder.remove_role_title')}
                  >
                    <X size={15} color={EMPTY} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              );
            }))}

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
              {/* One block per role: its name, then its answers as field rows. */}
              {withDividers(Object.entries(parsedRoleAnswers).flatMap(([roleKey, answers]) => {
                const questions = ROLE_QUESTIONS[roleKey];
                if (!questions) return [];
                return [
                  <View key={roleKey}>
                    <Text style={[styles.answersRole, font.semiBold, { textAlign }]}>{roleKey}</Text>
                    {withDividers(
                      questions
                        .filter((q) => !!answers[q.id])
                        .map((q) => renderField(questionLabel(q, rtl), answers[q.id])),
                    )}
                  </View>,
                ];
              }))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Publish bar, docked — the tab bar is hidden on this route ── */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.publishBtn,
            pressed && canConfirm && styles.publishBtnPressed,
            !canConfirm && styles.publishBtnDisabled,
          ]}
          onPress={() => void handleConfirm()}
          disabled={!canConfirm}
          accessibilityRole="button"
        >
          <Text style={[styles.publishText, font.bold]}>
            {isSubmitting
              ? t('builder.submitting')
              : isEditMode
                ? t('builder.save_changes')
                : t('builder.publish_project')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

/** The title is 800: Heebo has an ExtraBold face; Montserrat takes the weight. */
function extraBold(f: { fontFamily: string }) {
  return f.fontFamily.startsWith('Heebo')
    ? { fontFamily: 'Heebo-ExtraBold', fontWeight: '800' as const }
    : { fontFamily: f.fontFamily, fontWeight: '800' as const };
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  band: { paddingTop: 16, paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
  backRow: { alignItems: 'center', gap: 4 },
  backText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  screenTitle: { fontSize: 25, color: '#FFFFFF', letterSpacing: -0.3 },
  screenSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: -4 },

  /** Overlaps the band's bottom edge; zIndex so it paints over the gradient. */
  sheet: {
    flexGrow: 1,
    backgroundColor: PAGE_BG,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginTop: -22,
    zIndex: 1,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: 12,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -6 },
    elevation: 6,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFEDF5',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#4C1D95',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  cardTitleRow: { flex: 1, alignItems: 'center', gap: 6 },
  cardTitle: { flexShrink: 1, fontSize: 13.5, fontWeight: '700', color: '#000000' },
  cardCount: { fontSize: 12, color: MUTED },
  // Secondary: outlined, so three of them don't outweigh the publish button.
  // 30 tall + 7 above and below = 44.
  editBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD7EC',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  editBtnText: { fontSize: 12, fontWeight: '600', color: VIOLET_DEEP },

  divider: { height: 1, backgroundColor: HAIRLINE, marginHorizontal: 14 },

  fieldRow: { paddingVertical: 10, paddingHorizontal: 14, alignItems: 'flex-start', gap: 10 },
  fieldLabel: { width: LABEL_WIDTH, flexShrink: 0, fontSize: 12, lineHeight: 19, color: MUTED },
  value: { flex: 1, fontSize: 13.5, lineHeight: 20, fontWeight: '600', color: '#000000' },
  valueEmpty: { fontWeight: '400', color: EMPTY },
  answersRole: { fontSize: 12, color: VIOLET_DEEP, paddingTop: 10, paddingHorizontal: 14 },

  crewRow: { alignItems: 'center', gap: 11, paddingVertical: 10, paddingHorizontal: 14 },
  crewIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#F3EEFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crewGlyph: { width: 18, height: 18 },
  crewText: { flex: 1, minWidth: 0 },
  crewRole: { fontSize: 13.5, fontWeight: '600', color: '#000000' },
  crewMeta: { fontSize: 11.5, color: MUTED, marginTop: 2 },

  error: { fontSize: 12, color: '#e53935', paddingVertical: 10, paddingHorizontal: 14 },

  footer: {
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 14 + BOTTOM_INSET,
    borderTopWidth: 1,
    borderTopColor: '#F0EEF6',
  },
  publishBtn: {
    height: 52,
    borderRadius: 16,
    backgroundColor: VIOLET,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4C1D95',
    shadowOpacity: 0.28,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  publishBtnPressed: { backgroundColor: '#5B21B6' },
  publishBtnDisabled: { opacity: 0.4 },
  publishText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});

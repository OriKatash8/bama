import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ScrollView, StyleSheet, View, Text, TextInput, TouchableOpacity, FlatList, Platform,
  useWindowDimensions, ActivityIndicator, Modal, TouchableWithoutFeedback, Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { PageTitle } from '@components/ui/PageTitle';
import { HelpTooltip } from '@components/ui/HelpTooltip';
import { PressableScale } from '@components/ui/PressableScale';
import { TypingPlaceholder } from '@components/ui/TypingPlaceholder';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { commitFeedback, warnFeedback } from '@core/haptics';
import { useCrewBuilder } from '@features/crew/hooks';
import { MiniCalendar } from '@features/crew/components';
import { useTheme } from '@core/hooks/useTheme';
import { ROLE_BY_ID, getSpecializations, labelOf } from '@features/crew/data/categories';
import { roleIdForCategory } from '@features/noticeboard/matching';
import { getDocument } from '@core/firebase/firestore';
import { CalendarDays, ChevronLeft, ChevronRight, X, MapPin, Lock } from 'lucide-react-native';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ProjectRequest, FilledSlot } from '@core/types/project';
import { questionsForCategory, questionLabel, CATEGORY_QUESTION_MAP } from '@features/projects/constants/roleQuestions';
import { ISRAEL_LOCATIONS_HE, ISRAEL_LOCATIONS_EN } from '@core/constants/israelLocations';
import { formatIsoDay } from '@utils/formatters';
import { CATEGORIES, CATEGORY_ICON } from '@features/crew/data/roleTiles';
import { RADIUS, SPACE, SURFACE, TEXT } from '@core/constants/surface';

/**
 * The wizard's violet palette. Local on purpose: this pass restyles this screen
 * only, and the brand tokens in useTheme stay as they are.
 */
const VIOLET = '#6D28D9';
const INK = '#1A1626';
const INK_2 = '#6B6880';
const PLACEHOLDER = '#9C99AD';
const FIELD_FILL = '#F6F5FA';
const FIELD_BORDER = '#EAE8F0';
const HAIRLINE = '#F0EEF6';
const FIELD_GAP = 18;
/** Chrome draws `outline: auto` over the violet ring on focus, whatever the
 *  width; RN's types have no 'none', hence the cast (web only). */
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;
const TILE_GAP = 9;
/** Runs top-right to bottom-left, so the light end trails the reading direction in Hebrew. */
const BAND_GRADIENT = {
  colors: ['#1D4FD8', '#5B33E0', '#8B45E8', '#A855F7'] as const,
  locations: [0, 0.46, 0.78, 1] as const,
  start: { x: 1, y: 0 },
  end: { x: 0.15, y: 1 },
};
/** Along the button's length, a shallower angle than the band (~105deg). */
const BUTTON_GRADIENT = {
  colors: ['#2563EB', '#6D34DE', '#9A4BF0'] as const,
  locations: [0, 0.52, 1] as const,
  start: { x: 1, y: 0 },
  end: { x: 0, y: 0.35 },
};

/** Apple's pair: `duration` is the response, `dampingRatio` the damping. 1.0 —
 *  critically damped — because a button press carries no momentum, and an
 *  overshoot on a transition nobody threw reads as wobble. */
const STEP_SPRING = { duration: 400, dampingRatio: 1 } as const;

/** How far a step travels. A hint of direction, not a full-width push: the
 *  content is a tall form, and shoving it a whole screen sideways reads as a
 *  page turn rather than a step. */
const STEP_SLIDE = 40;

/** Top-to-bottom, so "the first error" means the highest one on the page. */
const ERROR_FIELDS = ['title', 'description', 'deadline'] as const;

/**
 * Worked examples for the description field, typed out one at a time so a client
 * can see the SHAPE of a useful brief rather than being told to write one.
 *
 * Each runs to about two lines, and each one demonstrates the same five things
 * the static placeholder merely asks for: what the job is, where, at what scale,
 * what is in scope, and what they expect to receive. The length IS the lesson —
 * a one-line example teaches clients to write one line.
 */
const DESCRIPTION_EXAMPLES = {
  he: [
    'צילום חתונה בתל אביב, 150 אורחים, מהחופה ועד סוף הריקודים. צריך צלם סטילס וצלם וידאו, ובסוף סרטון ערוך של חמש דקות.',
    'סרטון תדמית לחברת הייטק. יום צילום אחד במשרדים בהרצליה, ראיונות עם שלושה עובדים וצילומי אווירה. התוצר: דקה וחצי.',
    'יש לי שעתיים של חומר גלם מכנס, ואני צריך שמונה קליפים קצרים לאינסטגרם עם כתוביות בעברית. עריכה בלבד, בלי צילום.',
    'צילום מוצר לאתר מכירות: כארבעים פריטי תכשיטים על רקע לבן, בסטודיו עם תאורה, כולל ריטוש בסיסי לכל תמונה.',
  ],
  en: [
    'Wedding in Tel Aviv, 150 guests. Stills and video from the ceremony on, plus a five-minute edit.',
    'Brand film for a tech company. One day at our Herzliya office, three interviews, a 90-second cut.',
    'Two hours of conference footage. I need eight short vertical clips for Instagram, with Hebrew subtitles.',
    'Product photos for a web store: forty jewellery pieces on white, studio lighting, basic retouching.',
  ],
} as const;


export default function HomeScreen() {
  const { slots, totalCount, roleQuantity, setQuantity, slotCaps, setSlotCapability, removeCategory, loadSlots } = useCrewBuilder();
  const colors = useTheme();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const isEditMode = !!projectId;
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const { width } = useWindowDimensions();
  const tileSize = Math.floor((width - 64 - 8) / 2);

  const language = useSettingsStore((s) => s.language);
  const translations = language === 'he' ? he : en;
  const t = (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
  const rtl = language === 'he';
  /**
   * Type overrides for the page title, passed through PageTitle's `style` prop —
   * PageTitle is shared by every tab page, so this stays on home.
   *
   * Leading: display text on RN's default leading sits too loose; 30/25 is
   * the tight end at display size. Tracking is the design spec's -0.3 in both
   * languages — slight enough that Heebo's joins survive it.
   */
  const titleType = {
    // White on the violet band. PageTitle's own inset and top margin are zeroed
    // because the band pads its contents. 800 has no entry in useAppFont, and a
    // custom face ignores fontWeight on iOS, so Hebrew names the ExtraBold face
    // outright; Montserrat is a variable font and takes the weight directly.
    color: '#FFFFFF',
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.3,
    fontWeight: '800' as const,
    ...(rtl ? { fontFamily: 'Heebo-ExtraBold' } : null),
    marginTop: 0,
    marginBottom: 0,
    paddingHorizontal: 0,
  };
  /**
   * The optional marker. Small text wants a little POSITIVE tracking to stay
   * legible, and small caps is what makes a label of this size read as
   * deliberate rather than leftover — but both are Latin devices. `uppercase` is
   * a no-op on Hebrew, and Heebo does not take tracking, so Hebrew gets the size
   * and colour and nothing else.
   */
  const optionalType = rtl
    ? null
    : { textTransform: 'uppercase' as const, letterSpacing: 0.6 };
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';

  const scrollRef = useRef<ScrollView>(null);
  /** Armed at a swap, disarmed the moment it fires. Entering step 2 wants the
   *  END of the content, which needs the final height of an 8-tile image grid —
   *  the one case a timer could never reliably wait for. */
  const scrollToEndArmed = useRef(false);
  /** y of the card, and of each error-bearing field within it. Summed, they give
   *  a scroll offset; onLayout alone is parent-relative and would be short by
   *  the height of everything above the card. */
  const cardY = useRef(0);
  const fieldY = useRef<Record<string, number>>({});
  const font = useAppFont();
  const styles = useMemo(
    () => createStyles(font.regular.fontFamily, font.bold.fontFamily, font.semiBold.fontFamily, font.medium.fontFamily),
    [font.regular, font.bold, font.semiBold, font.medium],
  );

  // ── Form state (single source of truth for all steps + summary) ──
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [description, setDescription] = useState('');
  /** Latches on first focus — the typed placeholder never resumes after that. */
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  /** Visual only: drives the input focus ring and the pressed CTA fill. */
  const [focusedField, setFocusedField] = useState<'title' | 'description' | null>(null);
  const [ctaPressed, setCtaPressed] = useState(false);
  const [exec, setExec] = useState('');
  const [deadline, setDeadline] = useState('');
  const [location, setLocation] = useState('');
  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [calOpen, setCalOpen] = useState<'exec' | 'deadline' | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [roleAnswers, setRoleAnswers] = useState<Record<string, Record<string, string>>>({});
  // Slots already occupied by an assigned professional (edit mode). Roles with
  // any occupied slot cannot be removed — only added to.
  const [filledSlots, setFilledSlots] = useState<FilledSlot[]>([]);
  const occupiedByCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of filledSlots) m[f.category] = (m[f.category] ?? 0) + 1;
    return m;
  }, [filledSlots]);

  // After a new project is submitted (from the summary screen), wipe this form.
  const projectSubmittedNonce = useUiStore((s) => s.projectSubmittedNonce);
  const seenSubmitNonce = useRef(projectSubmittedNonce);
  useEffect(() => {
    if (projectSubmittedNonce === seenSubmitNonce.current) return;
    seenSubmitNonce.current = projectSubmittedNonce;
    setStep(1);
    setTitle('');
    setDescription('');
    setExec('');
    setDeadline('');
    setLocation('');
    setRoleAnswers({});
    setErrors({});
    setCalOpen(null);
    setLocationModalOpen(false);
    setLocationSearch('');
    setFilledSlots([]);
    loadSlots([]);
  }, [projectSubmittedNonce, loadSlots]);

  // The review screen's per-section "edit" links pop back to this screen (which
  // stayed mounted, so every field survives) and ask for a specific step.
  const builderStep = useUiStore((s) => s.builderStep);
  const builderStepNonce = useUiStore((s) => s.builderStepNonce);
  const seenStepNonce = useRef(builderStepNonce);
  useEffect(() => {
    if (builderStepNonce === seenStepNonce.current) return;
    seenStepNonce.current = builderStepNonce;
    goToStep(builderStep);
  }, [builderStepNonce, builderStep]);

  const todayISO = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const tomorrowISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const locationList = language === 'he' ? ISRAEL_LOCATIONS_HE : ISRAEL_LOCATIONS_EN;
  const locations = useMemo(() => {
    const q = locationSearch.trim().toLowerCase();
    if (!q) return locationList;
    return locationList.filter((c) => c.toLowerCase().includes(q));
  }, [locationSearch, locationList]);

  const showLocationAdd = locationSearch.trim().length > 0 &&
    !locations.some((c) => c.toLowerCase() === locationSearch.trim().toLowerCase());

  useEffect(() => {
    if (!projectId) return;
    setIsLoadingProject(true);
    getDocument<ProjectRequest>(`projects/${projectId}`)
      .then((project) => {
        if (!project) return;
        setTitle(project.title ?? '');
        setDescription(project.description ?? '');
        setExec(project.exec ?? '');
        setDeadline(project.deadline ?? '');
        setLocation(project.location);
        setRoleAnswers(project.roleAnswers ?? {});
        setFilledSlots(project.filledSlots ?? []);
        loadSlots(project.crewSlots);
      })
      .finally(() => setIsLoadingProject(false));
  }, [projectId, loadSlots]);

  const tx = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  // translateX only. Opacity is deliberately NOT animated: a value stranded at 0
  // is an unusable screen, whereas a translateX stranded at 40 is content that
  // is merely off-centre. The failure mode has to stay survivable.
  const stepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  /**
   * The step changes SYNCHRONOUSLY, and the animation is decorative.
   *
   * This used to be exit spring -> swap -> enter spring, with the swap inside
   * the exit spring's completion callback. Reanimated 4 never invokes that
   * callback on web, so the screen faded out, slid, and stayed on the old step
   * forever — the builder could not be used past step 1. Nothing about which
   * content is on screen may depend on an animation reporting anything.
   */
  function goToStep(next: 1 | 2 | 3, opts?: { scrollToEnd?: boolean }) {
    // The review screen can ask for the step it is already on — that is what the
    // nonce is for. Nothing to animate, but the scroll reset still applies.
    if (next === step) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    // I18nManager is not used anywhere in this app, so translateX is always
    // screen-left-origin and nothing mirrors by itself. Forward enters from the
    // right in English and from the LEFT in Hebrew, by hand.
    const dir = (next > step ? 1 : -1) * (rtl ? -1 : 1);

    setStep(next);
    if (opts?.scrollToEnd) scrollToEndArmed.current = true;
    else scrollRef.current?.scrollTo({ y: 0, animated: false });

    // Reduced motion is about vestibular motion, not about feedback: the step
    // still changes and the scroll still resets, it just never travels.
    if (reduceMotion) return;

    // Enter only. There is no exit phase, so nothing needs to tell us when one
    // finished. Set the offset, spring it home.
    tx.value = dir * STEP_SLIDE;
    tx.value = withSpring(0, STEP_SPRING);
  }

  /** Take the user to the problem. A warning haptic on its own says "no" without
   *  saying "where", which is the defect this pairs with. */
  function scrollToFirstError(errs: Record<string, string>) {
    for (const key of ERROR_FIELDS) {
      if (!errs[key]) continue;
      const y = fieldY.current[key];
      if (y === undefined) break;
      scrollRef.current?.scrollTo({ y: Math.max(0, cardY.current + y - 24), animated: true });
      return;
    }
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  // ── Step 1 → Step 2 ──
  function handleNext() {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = t('builder.error_required');
    if (description.trim().length < 10) next.description = rtl ? 'נא לרשום לפחות 10 תווים' : 'Please write at least 10 characters';
    if (!deadline) next.deadline = t('builder.error_required');
    setErrors(next);
    if (Object.keys(next).length > 0) {
      warnFeedback();
      scrollToFirstError(next);
      return;
    }

    commitFeedback();
    goToStep(2, { scrollToEnd: true });
  }

  // ── Step 2 (roles + quantity) → Step 3 (per-slot subskill) ──
  function handleGoStep3() {
    if (totalCount === 0) {
      setErrors({ slots: t('builder.error_role') });
      warnFeedback();
      // errors.slots renders at the TOP of the roles card, and step 2 is entered
      // scrolled to the bottom — so without this the message lands above the
      // fold and the press reads as doing nothing. STATUS.md open item 12.
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setErrors({});
    commitFeedback();
    goToStep(3);
  }

  // ── Step 3 → Summary screen ──
  function handleReview() {
    commitFeedback();
    router.push({
      pathname: '/(client)/(tabs)/home/summary' as never,
      params: {
        title,
        description,
        exec,
        deadline,
        location,
        projectId: (projectId as string) ?? '',
        slots: JSON.stringify(slots),
        roleAnswers: JSON.stringify(roleAnswers),
      },
    });
  }

  const allAnswered = useMemo(() => {
    const uniqueCategories = [...new Set(slots.map(s => s.category))];
    return uniqueCategories.every(cat => {
      const questions = questionsForCategory(cat);
      if (questions.length === 0) return true;
      const roleKey = CATEGORY_QUESTION_MAP[cat];
      const answers = roleAnswers[roleKey] ?? {};
      return questions.every(q => !!answers[q.id]);
    });
  }, [slots, roleAnswers]);

  if (isLoadingProject) {
    return (
      <Screen scrollable={false} backgroundColor="#FFFFFF">
        <ActivityIndicator color={colors.accent} style={{ flex: 1, marginTop: 80 }} />
      </Screen>
    );
  }

  return (
    <Screen scrollable={false} backgroundColor="#FFFFFF">
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          // Fires when the new step's content has actually been measured — which
          // is the thing the old setTimeout(…, 50) was guessing at, and got wrong
          // whenever step 2's image grid was slow.
          if (!scrollToEndArmed.current) return;
          scrollToEndArmed.current = false;
          scrollRef.current?.scrollToEnd({ animated: false });
        }}
      >
      <Animated.View style={[styles.stepWrap, stepStyle]}>
        {/* ══════════════ STEP 1: Project details ══════════════ */}
        {step === 1 && (
          <>
            <LinearGradient {...BAND_GRADIENT} style={styles.band}>
              <PageTitle style={titleType}>{rtl ? 'בנה את הפרויקט שלך' : 'Build Your Project'}</PageTitle>
              <View style={[styles.progressRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <View style={[styles.progressBar, styles.progressDone]} />
                <View style={[styles.progressBar, styles.progressTodo]} />
                <View style={[styles.progressBar, styles.progressTodo]} />
              </View>
              <Text style={[styles.stepLabel, { textAlign: rtl ? 'right' : 'left' }]}>{t('builder.step_label_1')}</Text>
            </LinearGradient>

            <View style={[styles.sheet, styles.card]} onLayout={(e) => { cardY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.label, { textAlign: rtl ? 'right' : 'left', marginTop: 0 }]}>{t('builder.title')}</Text>
              {/* The ring is always mounted and only changes colour: mounting it
                  on focus would re-parent the TextInput and drop the keyboard. */}
              <View
                style={[styles.focusRing, focusedField === 'title' && styles.focusRingOn]}
                // Measured here, not on the input: the ring is the card's child,
                // so this y stays card-relative for scrollToFirstError.
                onLayout={(e) => { fieldY.current.title = e.nativeEvent.layout.y; }}
              >
              <TextInput
                style={[styles.input, webNoOutline, { textAlign: rtl ? 'right' : 'left' }, focusedField === 'title' && styles.inputFocused, errors.title ? { borderWidth: 1.5, borderColor: '#fc8181' } : null]}
                value={title}
                onChangeText={setTitle}
                onFocus={() => setFocusedField('title')}
                onBlur={() => setFocusedField((f) => (f === 'title' ? null : f))}
                placeholder={t('builder.placeholder_title')}
                placeholderTextColor={PLACEHOLDER}
                returnKeyType="next"
              />
              </View>
              {errors.title ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.title}</Text> : null}

              <Text style={[styles.label, { textAlign: rtl ? 'right' : 'left' }]}>
                {rtl ? 'ספר לנו על הפרויקט' : 'Tell us about your project'}
              </Text>
              <View style={[styles.focusRing, focusedField === 'description' && styles.focusRingOn]}>
              <View style={styles.descriptionWrap}>
              <TextInput
                style={[
                  styles.input,
                  styles.textarea,
                  webNoOutline,
                  { textAlign: rtl ? 'right' : 'left' },
                  focusedField === 'description' && styles.inputFocused,
                  errors.description ? { borderWidth: 1.5, borderColor: '#fc8181' } : null,
                ]}
                value={description}
                // The animated placeholder replaced the `placeholder` prop, so
                // there is no placeholder text left to find this input by.
                testID="description-input"
                onLayout={(e) => { fieldY.current.description = e.nativeEvent.layout.y; }}
                onChangeText={setDescription}
                onFocus={() => { setDescriptionTouched(true); setFocusedField('description'); }}
                onBlur={() => setFocusedField((f) => (f === 'description' ? null : f))}
                // No placeholder prop: the animated one is drawn behind this
                // input instead, so typing it cannot re-render the field.
                placeholderTextColor={PLACEHOLDER}
                multiline
                numberOfLines={6}
              />
              <TypingPlaceholder
                examples={DESCRIPTION_EXAMPLES[lang]}
                fallback={t('builder.tell_us_placeholder')}
                rtl={rtl}
                stopped={descriptionTouched || description.length > 0}
                hidden={description.length > 0}
                style={[
                  styles.typingPlaceholder,
                  { textAlign: rtl ? 'right' : 'left', color: PLACEHOLDER },
                ]}
              />
              </View>
              </View>
              {errors.description ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.description}</Text> : null}

              {/* Labels row — exec / deadline / location */}
              <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: TILE_GAP, alignItems: 'flex-start', marginTop: FIELD_GAP }}>
                <View style={[styles.tileTitleRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <Text style={[styles.tileTitle, exec ? styles.tileTitleSel : null]}>
                    {t('builder.execution')}
                  </Text>
                  <HelpTooltip text={t('builder.help_execution')} />
                </View>
                <View style={[styles.tileTitleRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <Text style={[styles.tileTitle, deadline ? styles.tileTitleSel : null]}>
                    {t('builder.deadline')}
                  </Text>
                  <HelpTooltip text={t('builder.help_deadline')} />
                </View>
                <View style={[styles.tileTitleRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <Text style={[styles.tileTitle, location ? styles.tileTitleSel : null]}>
                    {t('builder.location')}
                  </Text>
                  <HelpTooltip text={t('builder.help_location')} />
                </View>
              </View>

              {/* Squares row — exec / deadline / location */}
              <View
                style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: TILE_GAP, alignItems: 'flex-start', marginTop: 8 }}
                onLayout={(e) => { fieldY.current.deadline = e.nativeEvent.layout.y; }}
              >
                {/* Execution square */}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <PressableScale style={[styles.dateSquare, exec ? styles.dateSquareSel : null]} onPress={() => setCalOpen('exec')} activeScale={0.96}>
                    {exec ? (
                      <PressableScale
                        style={styles.dateSquareClear}
                        onPress={(e) => { e.stopPropagation?.(); setExec(''); }}
                        hitSlop={8}
                        activeScale={0.85}
                        haptic="commit"
                        testID="clear-exec"
                      >
                        <X size={12} color="#fff" strokeWidth={2.5} />
                      </PressableScale>
                    ) : null}
                    <CalendarDays size={19} color={exec ? VIOLET : INK_2} strokeWidth={1.8} />
                    <Text style={exec ? styles.dateSquareValue : styles.dateSquarePlaceholder} numberOfLines={2}>
                      {exec ? formatIsoDay(exec) : t('builder.placeholder_date')}
                    </Text>
                  </PressableScale>
                  <Text style={[styles.optionalTag, optionalType]}>{t('builder.optional')}</Text>
                </View>

                {/* Deadline square */}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <PressableScale
                    style={[styles.dateSquare, deadline ? styles.dateSquareSel : null, errors.deadline ? { borderWidth: 1.5, borderColor: '#fc8181' } : null]}
                    onPress={() => setCalOpen('deadline')}
                    activeScale={0.96}
                  >
                    {deadline ? (
                      <PressableScale
                        style={styles.dateSquareClear}
                        onPress={(e) => { e.stopPropagation?.(); setDeadline(''); }}
                        hitSlop={8}
                        activeScale={0.85}
                        haptic="commit"
                        testID="clear-deadline"
                      >
                        <X size={12} color="#fff" strokeWidth={2.5} />
                      </PressableScale>
                    ) : null}
                    <CalendarDays size={19} color={deadline ? VIOLET : INK_2} strokeWidth={1.8} />
                    <Text style={deadline ? styles.dateSquareValue : styles.dateSquarePlaceholder} numberOfLines={2}>
                      {deadline === 'flexible' ? t('builder.flexible') : (deadline ? formatIsoDay(deadline) : t('builder.placeholder_deadline'))}
                    </Text>
                  </PressableScale>
{errors.deadline ? <Text style={[styles.error, { textAlign: 'center' }]}>{errors.deadline}</Text> : null}
                </View>

                {/* Location square */}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <PressableScale
                    style={[styles.dateSquare, location ? styles.dateSquareSel : null, errors.location ? { borderWidth: 1.5, borderColor: '#fc8181' } : null]}
                    onPress={() => { setLocationSearch(''); setLocationModalOpen(true); }}
                    activeScale={0.96}
                  >
                    {location ? (
                      <PressableScale
                        style={styles.dateSquareClear}
                        onPress={(e) => { e.stopPropagation?.(); setLocation(''); }}
                        hitSlop={8}
                        activeScale={0.85}
                        haptic="commit"
                        testID="clear-location"
                      >
                        <X size={12} color="#fff" strokeWidth={2.5} />
                      </PressableScale>
                    ) : null}
                    <MapPin size={19} color={location ? VIOLET : INK_2} strokeWidth={1.8} />
                    <Text style={location ? styles.dateSquareValue : styles.dateSquarePlaceholder} numberOfLines={2}>
                      {location || t('builder.placeholder_location')}
                    </Text>
                  </PressableScale>
                  <Text style={[styles.optionalTag, optionalType]}>{t('builder.optional')}</Text>
                  {errors.location ? <Text style={[styles.error, { textAlign: 'center' }]}>{errors.location}</Text> : null}
                </View>
              </View>
            </View>

            {/* What the date actually DOES, said out loud.
                'flexible' is not a softer version of a date — it means the
                project has no end date at all and never closes by itself, which
                is a real consequence the client should meet here rather than
                discover weeks later when nothing has happened. */}
            {deadline ? (
              <Text
                style={[
                  styles.dateConsequence,
                  { textAlign: rtl ? 'right' : 'left', color: deadline === 'flexible' ? '#b7791f' : INK_2 },
                ]}
              >
                {deadline === 'flexible'
                  ? t('builder.flexible_no_autocomplete')
                  : t('builder.end_date_note')}
              </Text>
            ) : null}

            <View style={styles.grow} />
            <View style={styles.submitWrap}>
              <PressableScale
                style={[styles.submitBtn, ctaPressed && styles.submitBtnPressed]}
                onPressIn={() => setCtaPressed(true)}
                onPressOut={() => setCtaPressed(false)}
                onPress={handleNext}
                activeScale={0.98}
              >
                <LinearGradient {...BUTTON_GRADIENT} style={styles.submitFill}>
                  <Text style={styles.submitText}>{t('builder.next_step')}</Text>
                </LinearGradient>
              </PressableScale>
            </View>
          </>
        )}

        {/* ══════════════ STEP 2: Roles + quantity ══════════════ */}
        {step === 2 && (
          <>
            <LinearGradient {...BAND_GRADIENT} style={styles.band}>
              <PageTitle style={titleType}>{rtl ? 'בנה את הצוות שלך' : 'Build Your Crew'}</PageTitle>
              <View style={[styles.progressRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <View style={[styles.progressBar, styles.progressDone]} />
                <View style={[styles.progressBar, styles.progressDone]} />
                <View style={[styles.progressBar, styles.progressTodo]} />
              </View>
              <Text style={[styles.stepLabel, { textAlign: rtl ? 'right' : 'left' }]}>{t('builder.step_label_2')}</Text>
            </LinearGradient>

            <View style={styles.sheet}>

            <TouchableOpacity
              style={[styles.backArrow, { alignSelf: rtl ? 'flex-end' : 'flex-start', flexDirection: rtl ? 'row-reverse' : 'row' }]}
              onPress={() => goToStep(1)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {rtl
                ? <ChevronRight size={20} color={VIOLET} strokeWidth={2.5} />
                : <ChevronLeft size={20} color={VIOLET} strokeWidth={2.5} />}
              <Text style={styles.backArrowText}>{t('search.back').replace('← ', '')}</Text>
            </TouchableOpacity>

            <View style={styles.rolesCard}>
              {errors.slots ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left', marginBottom: 8 }]}>{errors.slots}</Text> : null}

              <FlatList
                data={CATEGORIES}
                extraData={slots}
                numColumns={2}
                scrollEnabled={false}
                keyExtractor={(cat) => cat.key}
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                windowSize={3}
                columnWrapperStyle={{ gap: SPACE.sm, justifyContent: 'center' }}
                ItemSeparatorComponent={() => <View style={{ height: SPACE.sm }} />}
                renderItem={({ item: cat }) => {
                  const q = roleQuantity(cat.key);
                  // Locked only at/below the assigned count: you can trim seats
                  // added above it, but never reduce below the occupied count.
                  const locked = q <= (occupiedByCategory[cat.key] ?? 0);
                  return (
                    <PressableScale
                      style={[styles.tile, { width: tileSize }]}
                      onPress={() => { if (q === 0) setQuantity(cat.key, 1); }}
                      // Only the press that actually seats a role is worth a
                      // buzz. Once the tile has seats it is inert — the −/+ row
                      // owns the count from then on — so a haptic here would be
                      // feedback for nothing.
                      haptic={q === 0 ? 'commit' : undefined}
                    >
                      {/* The clip is its own view so the selection ring can sit
                          OUTSIDE it. overflow:'hidden' lives here, on the body,
                          rather than on the tile — a ring at a negative offset on
                          a clipping parent is simply cut away. */}
                      <View style={styles.tileClip}>
                      {cat.glyph ? (
                        <View style={styles.tileGlyphWrap}>
                          <Image
                            source={cat.glyph}
                            style={styles.tileGlyph}
                            contentFit="contain"
                            tintColor="#004aad"
                            cachePolicy="memory-disk"
                          />
                        </View>
                      ) : null}
                      <View style={styles.tileOverlay}>
                        <Text style={styles.tileLabel} numberOfLines={1}>{labelOf(ROLE_BY_ID[cat.roleId], lang)}</Text>
                      </View>
                      {q > 0 && (
                        <View style={styles.tileControls}>
                          <PressableScale
                            style={[styles.tileControlBtnRemove, locked && styles.tileControlBtnLocked]}
                            onPress={(e) => { e.stopPropagation?.(); if (!locked) setQuantity(cat.key, q - 1); }}
                            disabled={locked}
                            accessibilityLabel={locked ? t('builder.role_locked_a11y') : undefined}
                            hitSlop={6}
                            activeScale={0.88}
                            haptic="commit"
                          >
                            {locked
                              ? <Lock size={11} color="#ffffff" strokeWidth={2.5} />
                              : <Text style={styles.tileControlText}>−</Text>}
                          </PressableScale>
                          <Text style={styles.tileCountText}>{q}</Text>
                          <PressableScale
                            style={styles.tileControlBtnAdd}
                            onPress={(e) => { e.stopPropagation?.(); setQuantity(cat.key, q + 1); }}
                            hitSlop={6}
                            activeScale={0.88}
                            haptic="commit"
                          >
                            <Text style={styles.tileControlText}>+</Text>
                          </PressableScale>
                        </View>
                      )}
                      </View>
                      {/* Drawn over, not in the box model, so selecting a tile
                          cannot nudge the grid the way borderWidth: 2 did. */}
                      {q > 0 && <View style={styles.tileRing} pointerEvents="none" />}
                    </PressableScale>
                  );
                }}
              />
            </View>

            </View>

            <View style={styles.grow} />
            <View style={styles.submitWrap}>
              <PressableScale
                style={[styles.submitBtn, ctaPressed && styles.submitBtnPressed]}
                onPressIn={() => setCtaPressed(true)}
                onPressOut={() => setCtaPressed(false)}
                onPress={handleGoStep3}
                activeScale={0.98}
              >
                <LinearGradient {...BUTTON_GRADIENT} style={styles.submitFill}>
                  <Text style={styles.submitText}>{t('builder.next_step')}</Text>
                </LinearGradient>
              </PressableScale>
            </View>
          </>
        )}

        {/* ══════════════ STEP 3: Per-slot subskill ══════════════ */}
        {step === 3 && (
          <>
            <LinearGradient {...BAND_GRADIENT} style={styles.band}>
              <PageTitle style={titleType}>{rtl ? 'התאמת התמחויות' : 'Match subskills'}</PageTitle>
              <View style={[styles.progressRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <View style={[styles.progressBar, styles.progressDone]} />
                <View style={[styles.progressBar, styles.progressDone]} />
                <View style={[styles.progressBar, styles.progressDone]} />
              </View>
              <Text style={[styles.stepLabel, { textAlign: rtl ? 'right' : 'left' }]}>{t('builder.step_label_3')}</Text>
            </LinearGradient>

            <View style={styles.sheet}>

            <TouchableOpacity
              style={[styles.backArrow, { alignSelf: rtl ? 'flex-end' : 'flex-start', flexDirection: rtl ? 'row-reverse' : 'row' }]}
              onPress={() => goToStep(2)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {rtl
                ? <ChevronRight size={20} color={VIOLET} strokeWidth={2.5} />
                : <ChevronLeft size={20} color={VIOLET} strokeWidth={2.5} />}
              <Text style={styles.backArrowText}>{t('search.back').replace('← ', '')}</Text>
            </TouchableOpacity>

            {[...new Set(slots.map((s) => s.category))].map((category) => {
              const roleId = roleIdForCategory(category);
              const subskills = getSpecializations(roleId); // general first
              const catDef = CATEGORIES.find((c) => c.key === category);
              const roleLabel = catDef ? labelOf(ROLE_BY_ID[catDef.roleId], lang) : category;
              const caps = slotCaps(category);
              return (
                <View key={category} style={styles.s3Card}>
                  {/* Role header */}
                  <View style={[styles.s3Header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                    {CATEGORY_ICON[category] ? (
                      <Image source={CATEGORY_ICON[category]} style={styles.s3Avatar} contentFit="cover" cachePolicy="memory-disk" />
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <AppText weight="bold" style={[styles.s3RoleName, { textAlign: rtl ? 'right' : 'left' }]}>{roleLabel}</AppText>
                      <AppText weight="regular" style={[styles.s3RoleNeed, { textAlign: rtl ? 'right' : 'left' }]}>
                        {rtl ? `${caps.length} דרושים` : `${caps.length} needed`}
                      </AppText>
                    </View>
                  </View>

                  {/* Slots */}
                  {caps.map((current, i) => {
                    const selectedId = current ?? 'general';
                    const selectedLabel = labelOf(subskills.find((s) => s.id === selectedId) ?? subskills[0], lang);
                    const multiple = caps.length > 1;
                    return (
                      <View key={i} style={styles.s3Slot}>
                        <View style={[styles.s3SlotHead, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                          {multiple && (
                            <>
                              <View style={styles.s3Num}>
                                <AppText weight="bold" style={styles.s3NumText}>{i + 1}</AppText>
                              </View>
                              <AppText weight="regular" style={styles.s3SlotLabel}>{`${roleLabel} ${i + 1}`}</AppText>
                            </>
                          )}
                          <View style={{ flex: 1 }} />
                          <AppText weight="semiBold" style={styles.s3SelLabel}>{selectedLabel}</AppText>
                        </View>
                        <View style={[styles.s3PillRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                          {subskills.map((sp) => {
                            const on = selectedId === sp.id;
                            return (
                              <PressableScale
                                key={sp.id}
                                style={[styles.s3Pill, on ? styles.s3PillSel : styles.s3PillUnsel]}
                                onPress={() => setSlotCapability(category, i, sp.id === 'general' ? undefined : sp.id)}
                                activeScale={0.94}
                                haptic="tap"
                              >
                                <AppText weight="semiBold" style={on ? styles.s3PillTextSel : styles.s3PillTextUnsel}>
                                  {labelOf(sp, lang)}
                                </AppText>
                              </PressableScale>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })}

            </View>

            <View style={styles.grow} />
            <View style={styles.submitWrap}>
              <PressableScale
                style={[styles.submitBtn, ctaPressed && styles.submitBtnPressed]}
                onPressIn={() => setCtaPressed(true)}
                onPressOut={() => setCtaPressed(false)}
                onPress={handleReview}
                activeScale={0.98}
              >
                <LinearGradient {...BUTTON_GRADIENT} style={styles.submitFill}>
                  <AppText weight="bold" style={styles.submitText}>
                    {rtl ? 'המשך לסקירה' : 'Continue to review'}
                  </AppText>
                </LinearGradient>
              </PressableScale>
            </View>
          </>
        )}

      </Animated.View>
      </ScrollView>




      {/* ── Location picker modal — same style as MiniCalendar ── */}
      <Modal
        visible={locationModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationModalOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setLocationModalOpen(false)}>
          <View style={styles.locationOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.locationBox}>
                {/* Header — mirrors MiniCalendar nav row */}
                <View style={styles.locationNav}>
                  <Text style={[styles.locationNavTitle, { ...font.bold }]}>
                    {t('builder.location')}
                  </Text>
                  <TouchableOpacity onPress={() => setLocationModalOpen(false)} hitSlop={12} activeOpacity={0.7}>
                    <X size={18} color="#004aad" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>

                {/* Search input */}
                <TextInput
                  style={[styles.locationSearchInput, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
                  value={locationSearch}
                  onChangeText={setLocationSearch}
                  placeholder={t('builder.search_city')}
                  placeholderTextColor="#004aad80"
                  autoFocus
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />

                {/* City list */}
                <FlatList
                  data={locations}
                  keyExtractor={(item) => item}
                  keyboardShouldPersistTaps="handled"
                  initialNumToRender={15}
                  maxToRenderPerBatch={15}
                  windowSize={3}
                  style={styles.locationList}
                  ItemSeparatorComponent={() => <View style={styles.locationSeparator} />}
                  ListFooterComponent={showLocationAdd ? (
                    <TouchableOpacity
                      style={[styles.locationRow, styles.locationAddRow]}
                      onPress={() => {
                        setLocation(locationSearch.trim());
                        setLocationModalOpen(false);
                        setLocationSearch('');
                      }}
                      activeOpacity={0.7}
                    >
                      <MapPin size={14} color="#004aad" strokeWidth={1.8} />
                      <Text style={[styles.locationAddText, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
                        {rtl ? `+ הוסף "${locationSearch.trim()}"` : `+ Add "${locationSearch.trim()}"`}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.locationRow}
                      onPress={() => {
                        setLocation(item);
                        setLocationModalOpen(false);
                        setLocationSearch('');
                      }}
                      activeOpacity={0.7}
                    >
                      <MapPin size={14} color="#004aad" strokeWidth={1.8} />
                      <Text style={[styles.locationRowText, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {calOpen !== null && (
        <MiniCalendar
          value={calOpen === 'exec' ? exec : (deadline === 'flexible' ? '' : deadline)}
          onSelect={(d) => {
            if (calOpen === 'exec') setExec(d);
            else setDeadline(d);
            setCalOpen(null);
          }}
          onClose={() => setCalOpen(null)}
          showFlexible={calOpen === 'deadline'}
          isFlexible={deadline === 'flexible'}
          onFlexible={() => { setDeadline(deadline === 'flexible' ? '' : 'flexible'); setCalOpen(null); }}
          flexibleLabel={t('builder.flexible')}
          minDate={calOpen === 'exec' ? tomorrowISO : (exec || todayISO)}
          maxDate={calOpen === 'exec' && deadline && deadline !== 'flexible' ? deadline : undefined}
        />
      )}
    </Screen>
  );
}

function createStyles(
  ff: string,
  ffBold: string,
  ffSemiBold: string,
  ffMedium: string,
) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    // flexGrow lets step 1 fill a tall screen, so the spacer below the card can
    // push the next-step button to the bottom instead of leaving dead space under
    // it. Short screens still scroll normally.
    scrollContent: { paddingBottom: 56, flexGrow: 1 },
    /** Carries the step transition. flexGrow so the `grow` spacer inside each
     *  step still reaches the bottom of a tall screen — the wrapper sits between
     *  the content container and the step, and would otherwise break that chain. */
    stepWrap: { flexGrow: 1 },
    descriptionWrap: { position: 'relative' },
    /** Under the square, centred on it. Out of the square entirely now, so it no
     *  longer contends with the help "?" or the clear "x" for a corner, and it
     *  can stay visible whether or not the field has been filled. */
    optionalTag: {
      marginTop: SPACE.xs,
      fontSize: 9,
      fontFamily: ffMedium,
      color: PLACEHOLDER,
      textAlign: 'center',
    },
    /** Aligned to the input's own text origin: same padding, same size and
     *  leading, so the typed text sits exactly where the user's will. */
    typingPlaceholder: {
      // 16/13 = the textarea's 15/12 padding plus its 1pt border.
      paddingHorizontal: 16,
      paddingVertical: 13,
      fontSize: 14.5,
      lineHeight: 23,
      fontFamily: ff,
    },
    /** Eats the leftover height on tall screens, pushing the button down. Used
     *  by all three steps so the button lands in the same place throughout. */
    grow: { flexGrow: 1 },

    // Direction is set inline per render: the three segments are equal-flex
    // siblings coloured in order, so the row's direction IS the fill direction.
    // Hardcoded 'row' filled left-to-right in Hebrew, against the step label.
    progressRow: { gap: 6, marginTop: 16 },
    progressBar: { flex: 1, height: 4, borderRadius: 99 },
    progressDone: { backgroundColor: 'rgba(255,255,255,0.95)' },
    progressTodo: { backgroundColor: 'rgba(255,255,255,0.28)' },
    stepLabel: { marginTop: 8, fontSize: 11.5, fontWeight: '500', fontFamily: ffMedium, color: 'rgba(255,255,255,0.92)' },

    band: { paddingTop: 22, paddingHorizontal: 20, paddingBottom: 30 },
    /** Overlaps the band's bottom edge. zIndex so it paints over the gradient. */
    sheet: {
      backgroundColor: '#FFFFFF',
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      marginTop: -22,
      zIndex: 1,
      paddingTop: 26,
      paddingHorizontal: 20,
      shadowColor: '#4C1D95',
      shadowOpacity: 0.09,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: -6 },
      elevation: 6,
    },

    // alignSelf and flexDirection are set INLINE per call site: a plain View does
    // not flip with the app language, so a hardcoded 'flex-start' pins this to the
    // LEFT in Hebrew too. The chevron is swapped for the same reason — back points
    // right in RTL.
    // Sits at the top of the sheet now, which already carries the inset. The
    // vertical padding keeps the row at a 44pt touch height with the hitSlop.
    backArrow: { alignItems: 'center', gap: SPACE.xs, paddingVertical: SPACE.sm },
    backArrowText: { color: VIOLET, fontSize: 15, fontWeight: '600', fontFamily: ffSemiBold },

    /** Step 1's field group. The sheet supplies surface and inset. */
    card: { paddingBottom: SPACE.xs },
    rolesCard: { marginTop: SPACE.xs, paddingVertical: SPACE.sm },
    sectionTitle: { fontSize: 20, fontWeight: '800', fontFamily: ffBold, marginBottom: 12 },
    label: { fontSize: 14, lineHeight: 20, fontWeight: '600', fontFamily: ffSemiBold, color: INK, marginTop: FIELD_GAP, marginBottom: SPACE.sm },
    // No lineHeight here on purpose: on a single-line TextInput it fights RN's
    // own vertical centring, and the one place leading actually matters — the
    // multiline description — already sets 21 inline at its own 15pt size.
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: FIELD_BORDER,
      borderRadius: 14,
      backgroundColor: FIELD_FILL,
      paddingHorizontal: 15,
      fontSize: 15,
      color: INK,
      fontFamily: ff,
    },
    textarea: { height: 106, fontSize: 14.5, lineHeight: 23, paddingVertical: 12, textAlignVertical: 'top' },
    inputFocused: { borderColor: '#8B5CF6', backgroundColor: '#FFFFFF' },
    /** margin -3 cancels the ring's own width, so focusing moves nothing. */
    focusRing: { borderWidth: 3, borderColor: 'transparent', borderRadius: 17, margin: -3 },
    focusRingOn: { borderColor: 'rgba(139,92,246,0.18)' },
    error: { fontSize: 12, lineHeight: 16, color: '#fc8181', marginTop: 4, fontFamily: ff },
    dateConsequence: { fontSize: 11.5, lineHeight: 18, marginTop: SPACE.md, paddingHorizontal: 20, fontFamily: ff },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    // No overflow here — the ring needs to escape. The tile is a positioning
    // box; the surface and the clipping both live on tileClip.
    tile: { position: 'relative', alignItems: 'center' },
    tileClip: {
      width: '100%',
      borderRadius: RADIUS.md,
      overflow: 'hidden',
      alignItems: 'center',
      backgroundColor: FIELD_FILL,
      borderWidth: 1,
      borderColor: FIELD_BORDER,
    },
    tileGlyphWrap: { width: '100%', height: 80, alignItems: 'center', justifyContent: 'center' },
    tileGlyph: { width: 44, height: 44 },
    tileRing: {
      position: 'absolute',
      top: -2, left: -2, right: -2, bottom: -2,
      borderWidth: 2,
      borderColor: '#cb6ce6',
      borderRadius: RADIUS.md + 2,
    },
    tileOverlay: { width: '100%', paddingTop: 0, paddingBottom: SPACE.sm, paddingHorizontal: SPACE.xs },
    tileLabel: { fontSize: 14, fontWeight: '700', fontFamily: ffBold, color: TEXT.primary, textAlign: 'center', lineHeight: 17, includeFontPadding: false },
    tileControls: { width: '100%', height: 28, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACE.sm, backgroundColor: '#FFFFFF' },
    tileControlBtnRemove: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(229,57,53,0.85)', alignItems: 'center', justifyContent: 'center' },
    tileControlBtnLocked: { backgroundColor: 'rgba(120,125,150,0.7)' },
    tileControlBtnAdd: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#004aad', alignItems: 'center', justifyContent: 'center' },
    tileControlText: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 16 },
    tileCountText: { color: '#004aad', fontSize: 14, fontWeight: '800', fontFamily: ffBold, minWidth: 14, textAlign: 'center' },
    /** Shared by all three steps, so the next-step button is the same width
     *  throughout. The 36pt inset used to be inline on step 1 only, leaving
     *  steps 2 and 3 with the 16pt default and visibly wider buttons. */
    submitWrap: {
      backgroundColor: '#FFFFFF',
      paddingTop: 12,
      paddingBottom: 14,
      paddingHorizontal: 20,
      borderTopWidth: 1,
      borderTopColor: HAIRLINE,
      marginTop: SPACE.lg,
    },
    // Carries the shadow, so it must not clip; the gradient inside clips its
    // own corners instead (overflow on this view would cut the iOS shadow).
    submitBtn: {
      height: 52,
      borderRadius: 16,
      // Never seen (the gradient covers it), but Android draws elevation from
      // the view's background, and a transparent one casts no shadow.
      backgroundColor: '#6D34DE',
      shadowColor: '#3B19A0',
      shadowOpacity: 0.30,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    submitFill: { flex: 1, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    submitBtnPressed: { opacity: 0.88 },
    disabled: { backgroundColor: '#555' },
    submitText: { color: '#FFFFFF', fontSize: 16, lineHeight: 21, fontWeight: '700', fontFamily: ffBold },
    cancelBtn: { alignItems: 'center', paddingVertical: 12 },
    cancelText: { fontSize: 15, fontFamily: ff },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    panel: { width: '100%', maxHeight: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 2, overflow: 'hidden' },
    subcatPanel: { marginTop: 12, borderWidth: 2, borderRadius: 16, overflow: 'hidden' },
    panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
    panelTitle: { fontSize: 20, fontWeight: '800', fontFamily: ffBold },
    closeBtn: { fontSize: 18, fontWeight: '600', fontFamily: ffSemiBold },
    panelDivider: { height: 2, marginHorizontal: 20, borderRadius: 1, marginBottom: 4 },
    panelScroll: { maxHeight: 360 },

    // Subcategory popup modal (add-community style)
    subcatOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    subcatModal: {
      width: 320,
      borderRadius: 24,
      padding: 24,
      maxHeight: 500,
    },
    subcatHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    subcatTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#fff',
      flex: 1,
      marginRight: 8,
    },
    subcatHint: {
      color: 'rgba(255,255,255,0.6)',
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    subcatScroll: { maxHeight: 300 },
    subcatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.15)',
    },
    subcatRowLabel: {
      flex: 1,
      color: '#fff',
      fontSize: 15,
      fontWeight: '500',
    },
    subcatQtyBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    subcatQtyBtnText: { color: '#fff', fontSize: 16, lineHeight: 18 },
    subcatQtyBadge: {
      minWidth: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    subcatQtyBadgeText: { color: '#004aad', fontSize: 12 },
    subcatDoneBtn: {
      backgroundColor: '#fff',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 16,
    },
    subcatDoneBtnText: { color: '#004aad', fontSize: 16 },
    subHint: { fontSize: 12, fontWeight: '600', fontFamily: ffSemiBold, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 20, paddingVertical: 12 },
    subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1 },
    subLabel: { fontSize: 15, fontWeight: '500', fontFamily: ffMedium, flex: 1 },
    qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    qtyBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    qtyBtnText: { fontSize: 16, lineHeight: 18, fontWeight: '700', fontFamily: ffBold },
    qtyBadge: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    qtyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800', fontFamily: ffBold },
    dateRow: { flexDirection: 'row', gap: 16, marginTop: 0 },
    dateCol: { flex: 1 },
    dateSquare: {
      backgroundColor: FIELD_FILL,
      borderWidth: 1,
      borderColor: FIELD_BORDER,
      borderRadius: 16,
      width: '100%',
      minHeight: 84,
      justifyContent: 'center',
      alignItems: 'center',
      // 6, not 8: icon + two lines of value text + padding then fit exactly in
      // 84, so a wrapped value never makes its tile taller than its neighbours.
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 11,
    },
    dateSquareSel: { borderWidth: 1.5, borderColor: '#8B5CF6', backgroundColor: '#F3EEFE' },
    tileTitle: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', fontFamily: ffSemiBold, color: INK, textAlign: 'center' },
    tileTitleSel: { color: '#3B0764' },
    /** Title then "?", in reading order: flexDirection is set inline per language. */
    tileTitleRow: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 },
    dateSquarePlaceholder: {
      fontSize: 12.5,
      lineHeight: 16,
      fontWeight: '400',
      color: INK_2,
      textAlign: 'center',
      fontFamily: ff,
    },
    dateSquareValue: {
      fontSize: 12.5,
      lineHeight: 16,
      fontWeight: '500',
      color: VIOLET,
      textAlign: 'center',
      fontFamily: ffMedium,
    },
    dateSquareClear: {
      position: 'absolute',
      top: 6,
      right: 6,
      backgroundColor: VIOLET,
      borderRadius: 10,
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Summary modal
    summaryCard: { width: '100%', maxHeight: '90%', borderRadius: 24, overflow: 'hidden' },
    summaryGradient: { flex: 1, borderRadius: 24 },
    summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
    summaryTitle: { fontSize: 22, fontWeight: '800', fontFamily: ffBold, color: '#004aad', flex: 1 },
    summaryScroll: { paddingHorizontal: 20, paddingBottom: 24 },
    summaryFieldLabel: { fontSize: 13, fontWeight: '700', fontFamily: ffSemiBold, color: '#004aad', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
    summaryInput: {
      backgroundColor: 'rgba(255,255,255,0.7)',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      fontFamily: ff,
      color: '#004aad',
    },
    summaryMultiline: { height: 80, textAlignVertical: 'top' },
    summaryHint: { fontSize: 12, color: '#004aad', fontFamily: ff, marginTop: 4, opacity: 0.8 },
    summaryDateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(255,255,255,0.7)',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 6,
    },
    summaryDateText: { fontSize: 13, flex: 1, fontFamily: ff },
    summarySlotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,74,173,0.1)',
    },
    summarySlotInfo: { flex: 1 },
    summarySlotSub: { fontSize: 14, fontWeight: '600', fontFamily: ffSemiBold, color: '#004aad' },
    summarySlotCat: { fontSize: 12, color: '#004aad', fontFamily: ff, marginTop: 1 },
    removeSlotBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

    // Location picker — mirrors MiniCalendar overlay/box/nav
    locationOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    locationBox: {
      width: 300,
      maxHeight: 420,
      borderRadius: 16,
      borderWidth: 2,
      padding: 12,
      backgroundColor: '#ffffff',
      borderColor: '#004aad',
    },
    locationNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    locationNavTitle: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '700',
      color: '#004aad',
    },
    locationSearchInput: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 14,
      marginBottom: 6,
      color: '#004aad',
      borderColor: '#004aad',
    },
    locationList: {
      maxHeight: 280,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 7,
    },
    locationRowText: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '500',
      flex: 1,
      color: '#004aad',
    },
    locationSeparator: {
      height: 1,
      backgroundColor: '#004aad',
      opacity: 0.15,
    },
    locationAddRow: {
      borderTopWidth: 1,
      borderTopColor: 'rgba(0,74,173,0.15)',
      marginTop: 4,
      paddingTop: 10,
    },
    locationAddText: {
      fontSize: 14,
      lineHeight: 18,
      flex: 1,
      color: '#004aad',
    },

    // Vibe modal
    vibeOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    vibeCard: {
      width: '85%',
      backgroundColor: '#ffffff',
      borderRadius: 20,
      padding: 24,
      gap: 12,
    },
    vibeTitleText: {
      fontSize: 22,
      fontWeight: '800',
      color: '#004aad',
    },
    vibeSubtitle: {
      fontSize: 14,
      color: '#666666',
    },
    vibeInput: {
      borderWidth: 1,
      borderColor: '#004aad33',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      height: 80,
    },
    vibeBtnRow: {
      gap: 10,
      marginTop: 4,
    },
    vibeSkipBtn: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: '#cccccc',
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    vibeSkipText: {
      fontSize: 14,
      color: '#666666',
    },
    vibeAddBtn: {
      flex: 1,
      backgroundColor: '#004aad',
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    vibeAddText: {
      fontSize: 14,
      color: '#ffffff',
    },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
    chipSelected: { backgroundColor: '#004aad' },
    chipUnselected: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#004aad' },
    chipTextSelected: { color: '#fff', fontSize: 14 },
    chipTextUnselected: { color: '#004aad', fontSize: 14 },
    capHint: { fontSize: 13, fontWeight: '700', fontFamily: ffSemiBold, color: '#004aad' },
    capRoleLabel: { fontSize: 13, fontWeight: '600', fontFamily: ffSemiBold, color: '#7b2fa8' },
    // ── Step 3: per-slot subskill cards (soft profile-editor aesthetic) ──
    // Inset by the sheet it sits in. Outlined rather than filled: the sheet is
    // white, and the slots inside carry the fill.
    s3Card: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: FIELD_BORDER,
      borderRadius: RADIUS.md,
      padding: SPACE.lg,
      marginTop: SPACE.lg,
    },
    s3Header: { alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.xs },
    // borderRadius stays half the size so this remains a circle, not a
    // rounded square — at 80 it dominated the role header.
    s3Avatar: { width: 56, height: 56, borderRadius: 28 },
    s3RoleName: { fontSize: 16, lineHeight: 21, color: TEXT.primary },
    s3RoleNeed: { fontSize: 12, lineHeight: 16, color: TEXT.secondary, marginTop: 1 },
    s3Slot: { backgroundColor: FIELD_FILL, borderRadius: RADIUS.sm, padding: SPACE.md, marginTop: SPACE.md, gap: SPACE.sm },
    s3SlotHead: { alignItems: 'center', gap: SPACE.sm },
    s3Num: { width: 22, height: 22, borderRadius: 11, backgroundColor: SURFACE.raised, alignItems: 'center', justifyContent: 'center' },
    s3NumText: { fontSize: 12, color: TEXT.secondary },
    s3SlotLabel: { fontSize: 12, lineHeight: 16, color: TEXT.secondary },
    s3SelLabel: { fontSize: 13, lineHeight: 17, color: TEXT.primary },
    s3PillRow: { flexWrap: 'wrap', gap: SPACE.sm },
    s3Pill: { borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
    s3PillSel: { backgroundColor: '#004aad' },
    s3PillUnsel: { backgroundColor: SURFACE.raised },
    s3PillTextSel: { color: '#ffffff', fontSize: 13, lineHeight: 17 },
    s3PillTextUnsel: { color: TEXT.primary, fontSize: 13, lineHeight: 17 },
  });
}

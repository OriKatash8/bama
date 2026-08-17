import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ScrollView, StyleSheet, View, Text, TextInput, TouchableOpacity, FlatList, Platform,
  useWindowDimensions, ActivityIndicator, Modal, TouchableWithoutFeedback, Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { HelpTooltip } from '@components/ui/HelpTooltip';
import { useCrewBuilder } from '@features/crew/hooks';
import { MiniCalendar } from '@features/crew/components';
import { useTheme } from '@core/hooks/useTheme';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
import { getDocument } from '@core/firebase/firestore';
import { CalendarDays, ChevronLeft, X, MapPin } from 'lucide-react-native';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ProjectRequest } from '@core/types/project';
import { questionsForCategory, questionLabel, CATEGORY_QUESTION_MAP } from '@features/projects/constants/roleQuestions';

const categoryImages = {
  videographer:    require('../../../../../assets/images/categories/videographer-wide.png'),
  photographer:    require('../../../../../assets/images/categories/photographer-wide.png'),
  editor:          require('../../../../../assets/images/categories/editor-wide.png'),
  graphicDesigner: require('../../../../../assets/images/categories/graphic-designer-wide.png'),
  social:          require('../../../../../assets/images/categories/social-wide.png'),
  studios:         require('../../../../../assets/images/categories/studio-wide.png'),
  lighting:        require('../../../../../assets/images/categories/lighting-wide.png'),
  sound:           require('../../../../../assets/images/categories/sound-wide.png'),
};

const CATEGORY_META: Record<string, { labelKey: string; image: ReturnType<typeof require> }> = {
  'Video Photographer': { labelKey: 'builder.category_videographer', image: categoryImages.videographer },
  'Still Photographer': { labelKey: 'builder.category_photographer', image: categoryImages.photographer },
  'Editor':             { labelKey: 'builder.category_editor',        image: categoryImages.editor },
  'Graphic Designer':   { labelKey: 'builder.category_graphic_designer', image: categoryImages.graphicDesigner },
  'Social Media':       { labelKey: 'builder.category_social',        image: categoryImages.social },
  'Studio & Audio':     { labelKey: 'builder.category_studios',       image: categoryImages.studios },
  'Lighting Tech':      { labelKey: 'builder.category_lighting',      image: categoryImages.lighting },
  'Sound Recordist':    { labelKey: 'builder.category_sound',         image: categoryImages.sound },
};

const CATEGORIES = Object.entries(CREW_CATEGORIES).map(([key, subs]) => ({
  key,
  labelKey: CATEGORY_META[key]?.labelKey ?? key,
  image: CATEGORY_META[key]?.image,
  subcategories: subs,
}));

const ISRAEL_LOCATIONS_HE = [
  'תל אביב', 'ירושלים', 'חיפה', 'ראשון לציון', 'פתח תקווה', 'אשדוד',
  'נתניה', 'באר שבע', 'בני ברק', 'רמת גן', 'בת ים', 'הרצליה',
  'כפר סבא', 'חולון', 'רעננה', 'מודיעין', 'רחובות', 'אשקלון',
  'הוד השרון', 'גבעתיים', 'עכו', 'נהריה', 'טבריה', 'צפת',
  'לוד', 'רמלה', 'אילת', 'נצרת', 'קדימה צורן', 'כפר יונה',
  'נשר', 'קרית ביאליק', 'קרית מוצקין', 'קרית ים', 'קרית אתא',
  'עפולה', 'בית שאן', 'מגדל העמק', 'יוקנעם', 'זכרון יעקב',
  'פרדס חנה', 'בנימינה', 'טירת כרמל', 'גדרה', 'נס ציונה',
  'באר יעקב', 'אבן יהודה', 'תל מונד', 'נתיבות', 'שדרות',
  'קרית מלאכי', 'גן יבנה', 'מעלה אדומים', 'בית שמש', 'שוהם',
  'ראש העין', 'כפר עזה', 'בארי', 'נחל עוז', 'רעים', 'אופקים',
  'דגניה', 'עין חרוד', 'מרחביה', 'גינוסר', 'לביא',
  'גוש דן', 'שפלה', 'צפון', 'דרום', 'מרכז', 'שרון',
  'גליל', 'נגב', 'ירושלים והסביבה', 'עמק יזרעאל', 'הכרמל',
  'הגולן', 'עמק הירדן', 'ערבה', 'אילת והסביבה',
];

const ISRAEL_LOCATIONS_EN = [
  'Tel Aviv', 'Jerusalem', 'Haifa', 'Rishon LeZion', 'Petah Tikva',
  'Ashdod', 'Netanya', 'Beer Sheva', 'Bnei Brak', 'Ramat Gan',
  'Bat Yam', 'Herzliya', 'Kfar Saba', 'Holon', 'Raanana',
  "Modi'in", 'Rehovot', 'Ashkelon', 'Hod HaSharon', 'Givatayim',
  'Acre', 'Nahariya', 'Tiberias', 'Safed', 'Lod', 'Ramla',
  'Eilat', 'Nazareth', 'Kadima Zoran', 'Kfar Yona',
  'Nesher', 'Kiryat Bialik', 'Kiryat Motzkin', 'Kiryat Yam',
  'Kiryat Ata', 'Afula', 'Beit Shean', 'Migdal HaEmek',
  'Yokneam', 'Zichron Yaakov', 'Pardes Hanna', 'Binyamina',
  'Tirat Carmel', 'Gadera', 'Nes Ziona', 'Beer Yaakov',
  'Even Yehuda', 'Tel Mond', 'Netivot', 'Sderot',
  'Kiryat Malakhi', 'Gan Yavne', 'Maale Adumim', 'Beit Shemesh',
  'Shoham', 'Rosh HaAyin', 'Ofakim', 'Degania', 'Ein Harod',
  'Gush Dan', 'Shephelah', 'North', 'South', 'Center', 'Sharon',
  'Galilee', 'Negev', 'Jerusalem Area', 'Jezreel Valley',
  'Carmel', 'Golan', 'Jordan Valley', 'Arava', 'Eilat Area',
];

const webInputShadow = { boxShadow: '0 0 14px #7b4fd422, 0 0 28px #004aad14' } as object;


export default function HomeScreen() {
  const { slots, totalCount, addSlot, removeSlot, loadSlots } = useCrewBuilder();
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
  const getCategoryLabel = (labelKey: string) => labelKey === 'AI' ? 'AI' : t(labelKey);
  const rtl = language === 'he';

  const scrollRef = useRef<ScrollView>(null);
  const font = useAppFont();
  const styles = useMemo(
    () => createStyles(font.regular.fontFamily, font.bold.fontFamily, font.semiBold.fontFamily, font.medium.fontFamily),
    [font.regular, font.bold, font.semiBold, font.medium],
  );

  // ── Form state (single source of truth for all steps + summary) ──
  const [step, setStep] = useState<1 | 2>(1);
  const [description, setDescription] = useState('');
  const [exec, setExec] = useState('');
  const [deadline, setDeadline] = useState('');
  const [location, setLocation] = useState('');
  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [calOpen, setCalOpen] = useState<'exec' | 'deadline' | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [roleAnswers, setRoleAnswers] = useState<Record<string, Record<string, string>>>({});

  const locationList = language === 'he' ? ISRAEL_LOCATIONS_HE : ISRAEL_LOCATIONS_EN;
  const locations = useMemo(() => {
    const q = locationSearch.trim().toLowerCase();
    if (!q) return locationList;
    return locationList.filter((c) => c.toLowerCase().includes(q));
  }, [locationSearch, locationList]);

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
        loadSlots(project.crewSlots);
      })
      .finally(() => setIsLoadingProject(false));
  }, [projectId, loadSlots]);

  // ── Step 1 → Step 2 ──
  function handleNext() {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = t('builder.error_required');
    if (description.trim().length < 10) next.description = rtl ? 'נא לרשום לפחות 10 תווים' : 'Please write at least 10 characters';
    if (!deadline) next.deadline = t('builder.error_required');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setStep(2);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
  }

  // ── Step 2 → Summary screen ──
  function handleReview() {
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
      <Screen scrollable={false}>
        <ActivityIndicator color={colors.accent} style={{ flex: 1, marginTop: 80 }} />
      </Screen>
    );
  }

  return (
    <Screen scrollable={false}>
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* ══════════════ STEP 1: Project details ══════════════ */}
        {step === 1 && (
          <>
            <Text style={styles.pageTitle}>
              {rtl ? 'בנה את הפרויקט שלך' : 'Build Your Project'}
            </Text>
            <Text style={styles.stepLabel}>{rtl ? `שלב 1 מתוך 2` : `Step 1 of 2`}</Text>
            <View style={styles.progressRow}>
              <View style={[styles.progressBar, { backgroundColor: '#004aad' }]} />
              <View style={[styles.progressBar, { backgroundColor: colors.border }]} />
            </View>

            <View style={styles.card}>
              <Text style={[styles.label, { color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}>{t('builder.title')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: '#ffffff', color: colors.text, textAlign: rtl ? 'right' : 'left' }, Platform.OS === 'web' && webInputShadow, errors.title ? { borderWidth: 1.5, borderColor: '#fc8181' } : null]}
                value={title}
                onChangeText={setTitle}
                placeholder={t('builder.placeholder_title')}
                placeholderTextColor="#004aad99"
                returnKeyType="next"
              />
              {errors.title ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.title}</Text> : null}

              <Text style={[styles.label, { color: '#004aad', textAlign: rtl ? 'right' : 'left', marginTop: 6 }]}>
                {rtl ? 'ספר לנו על הפרויקט' : 'Tell us about your project'}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: '#ffffff', color: colors.text, textAlign: rtl ? 'right' : 'left', minHeight: 80, textAlignVertical: 'top' },
                  Platform.OS === 'web' && webInputShadow,
                  errors.description ? { borderWidth: 1.5, borderColor: '#fc8181' } : null,
                ]}
                value={description}
                onChangeText={setDescription}
                placeholder={rtl ? 'תאר מה אתה יוצר ומה חשוב לך' : 'Describe what you\'re making and what matters to you'}
                placeholderTextColor="#004aad99"
                multiline
                numberOfLines={3}
              />
              {errors.description ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.description}</Text> : null}

              {/* Labels row — exec / deadline / location */}
              <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 12, alignItems: 'flex-start', marginTop: 18 }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[styles.label, { color: '#004aad', marginTop: 0, marginBottom: 0, textAlign: 'center' }]}>
                    {t('builder.execution')}
                  </Text>
                  <Text style={{ fontSize: 9, color: colors.textMuted, textAlign: 'center', ...font.regular }}>
                    ({t('builder.optional')})
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[styles.label, { color: '#004aad', marginTop: 0, marginBottom: 0, textAlign: 'center' }]}>
                    {t('builder.deadline')}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[styles.label, { color: '#004aad', marginTop: 0, marginBottom: 0, textAlign: 'center' }]}>
                    {t('builder.location')}
                  </Text>
                  <Text style={{ fontSize: 9, color: colors.textMuted, textAlign: 'center', ...font.regular }}>
                    ({t('builder.optional')})
                  </Text>
                </View>
              </View>

              {/* Squares row — exec / deadline / location */}
              <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 12, alignItems: 'flex-start', marginTop: 8 }}>
                {/* Execution square */}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <TouchableOpacity style={styles.dateSquare} onPress={() => setCalOpen('exec')} activeOpacity={0.8}>
                    <View style={{ position: 'absolute', top: -8, left: -8 }}>
                      <HelpTooltip text={t('builder.help_execution')} />
                    </View>
                    {exec ? (
                      <TouchableOpacity
                        style={styles.dateSquareClear}
                        onPress={(e) => { e.stopPropagation?.(); setExec(''); }}
                        hitSlop={8}
                        activeOpacity={0.7}
                      >
                        <X size={12} color="#fff" strokeWidth={2.5} />
                      </TouchableOpacity>
                    ) : null}
                    <CalendarDays size={exec ? 20 : 28} color="#004aad" strokeWidth={1.8} />
                    <Text style={exec ? styles.dateSquareValue : styles.dateSquarePlaceholder} numberOfLines={2}>
                      {exec || t('builder.placeholder_date')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Deadline square */}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[styles.dateSquare, errors.deadline ? { borderWidth: 1.5, borderColor: '#fc8181' } : null]}
                    onPress={() => setCalOpen('deadline')}
                    activeOpacity={0.8}
                  >
                    <View style={{ position: 'absolute', top: -8, left: -8 }}>
                      <HelpTooltip text={t('builder.help_deadline')} />
                    </View>
                    {deadline ? (
                      <TouchableOpacity
                        style={styles.dateSquareClear}
                        onPress={(e) => { e.stopPropagation?.(); setDeadline(''); }}
                        hitSlop={8}
                        activeOpacity={0.7}
                      >
                        <X size={12} color="#fff" strokeWidth={2.5} />
                      </TouchableOpacity>
                    ) : null}
                    <CalendarDays size={deadline ? 20 : 28} color="#004aad" strokeWidth={1.8} />
                    <Text style={deadline ? styles.dateSquareValue : styles.dateSquarePlaceholder} numberOfLines={2}>
                      {deadline === 'flexible' ? t('builder.flexible') : (deadline || t('builder.placeholder_deadline'))}
                    </Text>
                  </TouchableOpacity>
{errors.deadline ? <Text style={[styles.error, { textAlign: 'center' }]}>{errors.deadline}</Text> : null}
                </View>

                {/* Location square */}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[styles.dateSquare, errors.location ? { borderWidth: 1.5, borderColor: '#fc8181' } : null]}
                    onPress={() => { setLocationSearch(''); setLocationModalOpen(true); }}
                    activeOpacity={0.8}
                  >
                    <View style={{ position: 'absolute', top: -8, left: -8 }}>
                      <HelpTooltip text={t('builder.help_location')} />
                    </View>
                    {location ? (
                      <TouchableOpacity
                        style={styles.dateSquareClear}
                        onPress={(e) => { e.stopPropagation?.(); setLocation(''); }}
                        hitSlop={8}
                        activeOpacity={0.7}
                      >
                        <X size={12} color="#fff" strokeWidth={2.5} />
                      </TouchableOpacity>
                    ) : null}
                    <MapPin size={location ? 20 : 28} color="#004aad" strokeWidth={1.8} />
                    <Text style={location ? styles.dateSquareValue : styles.dateSquarePlaceholder} numberOfLines={2}>
                      {location || t('builder.placeholder_location')}
                    </Text>
                  </TouchableOpacity>
                  {errors.location ? <Text style={[styles.error, { textAlign: 'center' }]}>{errors.location}</Text> : null}
                </View>
              </View>
            </View>

            <View style={[styles.submitWrap, { paddingHorizontal: 36, paddingTop: 4 }]}>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { alignSelf: 'stretch' },
                  Platform.OS === 'web' && ({ background: 'linear-gradient(to right, #004aad, #cb6ce6)' } as object),
                ]}
                onPress={handleNext}
                activeOpacity={0.8}
              >
                <Text style={styles.submitText}>{t('builder.next_step')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ══════════════ STEP 2: Select roles ══════════════ */}
        {step === 2 && (
          <>
            <Text style={styles.pageTitle}>
              {rtl ? 'בנה את הצוות שלך' : 'Build Your Crew'}
            </Text>
            <Text style={styles.stepLabel}>{rtl ? `שלב 2 מתוך 2` : `Step 2 of 2`}</Text>
            <View style={styles.progressRow}>
              <View style={[styles.progressBar, { backgroundColor: '#004aad' }]} />
              <View style={[styles.progressBar, { backgroundColor: '#004aad' }]} />
            </View>

            <TouchableOpacity style={styles.backArrow} onPress={() => setStep(1)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <ChevronLeft size={20} color="#004aad" strokeWidth={2.5} />
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
                columnWrapperStyle={{ gap: 8, justifyContent: 'center' }}
                ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
                renderItem={({ item: cat }) => {
                  const catSlot = slots.find(s => s.category === cat.key);
                  const catTotal = catSlot?.quantity ?? 0;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.tile,
                        { width: tileSize },
                        catTotal > 0 && { borderWidth: 2, borderColor: colors.accent },
                      ]}
                      onPress={() => { if (catTotal === 0) addSlot(cat.key); }}
                      activeOpacity={0.85}
                    >
                      {cat.image ? (
                        <Image source={cat.image} style={styles.tileImage} contentFit="cover" cachePolicy="memory-disk" />
                      ) : null}
                      <View style={styles.tileOverlay}>
                        <Text style={styles.tileLabel} numberOfLines={1}>{getCategoryLabel(cat.labelKey)}</Text>
                      </View>
                      {catTotal > 0 && (
                        <View style={styles.tileControls}>
                          <TouchableOpacity
                            style={styles.tileControlBtnRemove}
                            onPress={(e) => { e.stopPropagation?.(); removeSlot(cat.key); }}
                            hitSlop={6}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.tileControlText}>−</Text>
                          </TouchableOpacity>
                          <Text style={styles.tileCountText}>{catTotal}</Text>
                          <TouchableOpacity
                            style={styles.tileControlBtnAdd}
                            onPress={(e) => { e.stopPropagation?.(); addSlot(cat.key); }}
                            hitSlop={6}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.tileControlText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />

            </View>

            <View style={styles.submitWrap}>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  Platform.OS === 'web' && ({ background: 'linear-gradient(to right, #004aad, #cb6ce6)' } as object),
                ]}
                onPress={handleReview}
                activeOpacity={0.8}
              >
                <Text style={styles.submitText}>{t('builder.review')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

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
    scrollContent: { paddingBottom: 100 },
    pageTitle: { fontSize: 36, fontWeight: '800', fontFamily: ffBold, color: '#004aad', textAlign: 'center', textTransform: 'uppercase', marginTop: 20 },
    stepLabel: { fontSize: 13, color: '#004aad', opacity: 0.7, textAlign: 'center', marginTop: 2, marginBottom: 2 },

    progressRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 6, marginBottom: 4 },
    progressBar: { flex: 1, height: 4, borderRadius: 2 },

    backArrow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, alignSelf: 'flex-start' },
    backArrowText: { color: '#004aad', fontSize: 15, fontWeight: '600', fontFamily: ffSemiBold },

    card: { margin: 16, marginTop: 10, padding: 20 },
    rolesCard: { marginHorizontal: 16, marginTop: 8, padding: 16 },
    sectionTitle: { fontSize: 20, fontWeight: '800', fontFamily: ffBold, marginBottom: 12 },
    label: { fontSize: 18, fontWeight: '600', fontFamily: ffSemiBold, marginTop: 16, marginBottom: 6 },
    input: { borderWidth: 0, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, fontFamily: ff },
    multiline: { height: 100 },
    error: { fontSize: 12, color: '#fc8181', marginTop: 4, fontFamily: ff },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tile: { borderRadius: 12, overflow: 'hidden', position: 'relative', alignItems: 'center' },
    tileImage: { width: '100%', height: 100 },
    tileOverlay: { width: '100%', paddingTop: 0, paddingBottom: 2, paddingHorizontal: 5 },
    tileLabel: { fontSize: 14, fontWeight: '700', fontFamily: ffBold, color: '#004aad', textAlign: 'center', lineHeight: 17, includeFontPadding: false },
    tileControls: { width: '100%', height: 28, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.92)' },
    tileControlBtnRemove: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(229,57,53,0.85)', alignItems: 'center', justifyContent: 'center' },
    tileControlBtnAdd: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#004aad', alignItems: 'center', justifyContent: 'center' },
    tileControlText: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 16 },
    tileCountText: { color: '#004aad', fontSize: 14, fontWeight: '800', fontFamily: ffBold, minWidth: 14, textAlign: 'center' },
    submitWrap: { padding: 16, paddingBottom: 32 },
    submitBtn: { backgroundColor: '#004aad', borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
    disabled: { backgroundColor: '#555' },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: ffBold },
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
      backgroundColor: '#ffffff',
      borderRadius: 16,
      width: '100%',
      maxWidth: 120,
      height: 100,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
      padding: 8,
    },
    dateSquarePlaceholder: {
      fontSize: 11,
      color: '#004aad66',
      textAlign: 'center',
      fontFamily: ff,
    },
    dateSquareValue: {
      fontSize: 13,
      fontWeight: 'bold',
      color: '#004aad',
      textAlign: 'center',
      fontFamily: ffBold,
    },
    dateSquareClear: {
      position: 'absolute',
      top: 6,
      right: 6,
      backgroundColor: '#004aad',
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
      fontWeight: '500',
      flex: 1,
      color: '#004aad',
    },
    locationSeparator: {
      height: 1,
      backgroundColor: '#004aad',
      opacity: 0.15,
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
  });
}

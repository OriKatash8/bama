import { useMemo, useState, useEffect } from 'react';
import { formatIsoDay, rtlSafe } from '@utils/formatters';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, ActivityIndicator, TouchableWithoutFeedback,
} from 'react-native';
import { CalendarDays, Clock, MapPin, X } from 'lucide-react-native';
import { useAuthStore } from '@core/stores/authStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { MiniCalendar } from '@features/crew/components';
import { PressableScale } from '@components/ui/PressableScale';
import { addDocument, getDocument } from '@core/firebase/firestore';
import {
  ROLE_TO_LEGACY_CATEGORY, categoryLabel, getSpecializations, labelOf, capabilityOf,
} from '@features/crew/data/categories';
import { ISRAEL_LOCATIONS_HE, ISRAEL_LOCATIONS_EN } from '@core/constants/israelLocations';
import type { CrewRequestSlot } from '@core/types/project';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

// Violet on white, the client mode's accent: the chrome — buttons, icons,
// borders — carries the colour, and every line of copy is plain black. Only
// placeholders and the optional/cancel asides stay muted grey.
const VIOLET = '#6D28D9';
const TEXT = '#000000';
const MUTED_LABEL = 'rgba(15,15,31,0.4)';
const PLACEHOLDER = 'rgba(15,15,31,0.4)';
const HAIRLINE = 'rgba(109,40,217,0.15)';
// The exec/deadline/location squares are lifted wholesale from the home
// builder, tokens included, so the two forms ask for these three the same way.
// KEEP IN SYNC with (client)/(tabs)/home/index.tsx.
const INK_2 = '#6B6880';
const FIELD_FILL = '#F6F5FA';
const FIELD_BORDER = '#EAE8F0';
const TILE_PLACEHOLDER = '#9C99AD';
const TILE_SEL_BORDER = '#8B5CF6';
const TILE_SEL_FILL = '#F3EEFE';
const TILE_GAP = 9;

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

/** Local-time 'YYYY-MM-DD'. Deliberately not toISOString(), which is UTC and
 *  rolls the date over an evening in Asia/Jerusalem. */
/** Firestore-shaped "now". Module scope so the clock read stays out of the
 *  component body, where the purity lint rule cannot tell a submit handler
 *  from render. */
function nowTimestamp(): { seconds: number; nanoseconds: number } {
  return { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Props = {
  visible: boolean;
  professionalId: string;
  professionalName: string;
  onClose: () => void;
  onSubmitted: () => void;
};


export function DirectProjectSheet({ visible, professionalId, professionalName, onClose, onSubmitted }: Props) {
  const user = useAuthStore((s) => s.user);
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  // 'YYYY-MM-DD' strings compare lexicographically, which is why every date in
  // this codebase is stored that way — no Date maths needed to order them.
  const todayISO = useMemo(() => isoOf(new Date()), []);

  /**
   * One entry per SKILL this professional actually lists, not per role.
   *
   * Asking for "Videographer" when the pro's profile says drone and music video
   * throws away the detail the client came here for. Each row is a
   * (role, specialization) pair, so the slot it produces carries the exact
   * requiredCapability — which is also what professionalMatchesSlot keys on.
   */
  type SkillOption = {
    /** Stable key: role + specialization. */
    id: string;
    /** Legacy category string stored on CrewRequestSlot.category. */
    category: string;
    /** Specialization id, or undefined for 'general' — see capabilityOf. */
    requiredCapability?: string;
    roleLabel: string;
    skillLabel: string;
  };
  const [skillOptions, setSkillOptions] = useState<SkillOption[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [exec, setExec] = useState('');
  const [deadline, setDeadline] = useState('');
  const [location, setLocation] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [calOpen, setCalOpen] = useState<'exec' | 'deadline' | null>(null);

  /** 'flexible' lives in the same field as a real date; nothing may treat that
   *  sentinel as one — not the ordering rules, not the exec picker's upper bound.
   *  Declared AFTER the state it reads: as a const it is in the temporal dead
   *  zone above, which tsc catches but only if it is referenced there. */
  const hasDeadlineDate = !!deadline && deadline !== 'flexible';

  // Location is a searchable picker over the shared city list, as on the home
  // builder — a free-text box let two clients write the same city two ways.
  // Same list, same "+ Add" escape hatch for anything not in it.
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const locationList = rtl ? ISRAEL_LOCATIONS_HE : ISRAEL_LOCATIONS_EN;
  const locations = useMemo(() => {
    const q = locationSearch.trim().toLowerCase();
    if (!q) return locationList;
    return locationList.filter((c) => c.toLowerCase().includes(q));
  }, [locationSearch, locationList]);
  const showLocationAdd = locationSearch.trim().length > 0 &&
    !locations.some((c) => c.toLowerCase() === locationSearch.trim().toLowerCase());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);


  useEffect(() => {
    if (!visible || !professionalId) return;
    setSkillsLoading(true);
    getDocument<{ roleSkills?: { role: string; specializations?: string[] }[] }>(
      `users/${professionalId}/profile/data`,
    )
      .then((profile) => {
        const lang = rtl ? 'he' : 'en';
        const options: SkillOption[] = [];
        for (const entry of profile?.roleSkills ?? []) {
          const category = ROLE_TO_LEGACY_CATEGORY[entry.role];
          if (!category) continue;
          const defs = getSpecializations(entry.role);
          const roleLabel = categoryLabel(category, lang);
          for (const specId of entry.specializations ?? []) {
            const def = defs.find((d) => d.id === specId);
            if (!def) continue; // retired specialization — nothing to label it with
            options.push({
              id: `${entry.role}:${specId}`,
              category,
              // 'general' is the ABSENCE of a requirement, never a requirement
              // named 'general'. capabilityOf is the single funnel for that.
              requiredCapability: capabilityOf(specId),
              roleLabel,
              skillLabel: labelOf(def, lang),
            });
          }
        }
        setSkillOptions(options);
      })
      .catch(() => setSkillOptions([]))
      .finally(() => setSkillsLoading(false));
  }, [visible, professionalId, rtl]);

  function reset() {
    setTitle('');
    setDescription('');
    setExec('');
    setDeadline('');
    setLocation('');
    setLocationSearch('');
    setLocationModalOpen(false);
    setQuantities({});
    setErrors({});
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Keyed by SkillOption.id, so asking for two different specializations of the
  // same role stays two independent counts.
  function setQty(optionId: string, delta: number) {
    setQuantities((prev) => {
      const next = Math.max(0, (prev[optionId] ?? 0) + delta);
      return { ...prev, [optionId]: next };
    });
  }

  function getQty(optionId: string) {
    return quantities[optionId] ?? 0;
  }

  function buildSlots(): CrewRequestSlot[] {
    return skillOptions
      .filter((o) => getQty(o.id) > 0)
      .map((o) => ({
        category: o.category,
        quantity: getQty(o.id),
        // Spread so the key is ABSENT for a general slot rather than written as
        // undefined — a slot with requiredCapability: 'general' could never be
        // filled, since assignFilledCapability yields undefined for it.
        ...(o.requiredCapability ? { requiredCapability: o.requiredCapability } : {}),
      }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = t('builder.error_required');
    if (!description.trim()) next.description = t('builder.error_required');
    if (!deadline) next.deadline = t('builder.error_required');
    if (!location.trim()) next.location = t('builder.error_required');
    if (buildSlots().length === 0) next.slots = t('builder.error_role');
    // The pickers already prevent this pair; validated anyway so the invariant
    // does not depend solely on the UI that happens to set it.
    if (exec && exec < todayISO) next.exec = t('builder.error_date_past');
    if (hasDeadlineDate && deadline < todayISO) next.deadline = t('builder.error_date_past');
    if (exec && hasDeadlineDate && exec > deadline) next.deadline = t('builder.error_deadline_order');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate() || !user) return;
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        clientId: user.id,
        title: title.trim(),
        description,
        exec: exec.trim() || undefined,
        deadline,
        location,
        crewSlots: buildSlots(),
        filledSlots: [],
        status: 'open',
        targetProfessionalId: professionalId,
        createdAt: nowTimestamp(),
      };
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
      await addDocument('projects', payload);
      reset();
      onSubmitted();
    } catch (e: unknown) {
      console.error('[DirectProjectSheet] submit failed:', e);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        {/* Tapping outside closes, as in the marketplace sheet. The dismiss layer
            is a SIBLING behind the card, not a wrapper — nesting the card inside a
            touchable makes its width:'100%' resolve against a content-sized
            parent and collapse. */}
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.heading, { ...font.bold, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
              {professionalName}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={12} activeOpacity={0.7}>
              <X size={20} color={VIOLET} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.scroll}>
            {/* Project name — the client names their own project. Same label and
                placeholder as the home builder's first step, so the two forms
                ask for it the same way. */}
            <Text style={[styles.label, { ...font.semiBold, marginTop: 0, textAlign: rtl ? 'right' : 'left' }]}>
              {t('builder.title')}
            </Text>
            <TextInput
              style={[styles.input, { textAlign: rtl ? 'right' : 'left' }]}
              value={title}
              onChangeText={setTitle}
              placeholder={t('builder.placeholder_title')}
              placeholderTextColor={PLACEHOLDER}
              maxLength={80}
              returnKeyType="next"
            />
            {errors.title ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.title}</Text> : null}

            {/* Description */}
            <Text style={[styles.label, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
              {t('builder.tell_us')}
            </Text>
            <TextInput
              style={[styles.input, styles.multiline, { color: TEXT, textAlign: rtl ? 'right' : 'left', fontSize: 13 }]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('builder.tell_us_placeholder')}
              placeholderTextColor={PLACEHOLDER}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {errors.description ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.description}</Text> : null}

            {/* Execution / deadline / location, as one row of squares — the
                same three tiles as the home builder's "Build Your Project" step
                (home/index.tsx). Icon over value, dd/mm/yyyy dates, violet once
                picked, a corner ✕ to clear. KEEP IN SYNC with that screen. */}
            <View style={[styles.tileRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              {/* Execution */}
              <View style={styles.tileCol}>
                <PressableScale
                  style={[styles.dateSquare, exec ? styles.dateSquareSel : null, errors.exec ? styles.dateSquareErr : null]}
                  onPress={() => setCalOpen('exec')}
                  activeScale={0.96}
                  testID="tile-exec"
                >
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
                  <Text style={[exec ? styles.dateSquareValue : styles.dateSquarePlaceholder, font.regular]} numberOfLines={2}>
                    {exec ? formatIsoDay(exec) : t('builder.placeholder_date')}
                  </Text>
                  {/* Only the execution date is optional here — unlike the home
                      builder, this sheet requires a location. */}
                  {!exec && <Text style={[styles.optionalTag, font.regular]}>{t('builder.optional_note')}</Text>}
                </PressableScale>
                {errors.exec ? <Text style={[styles.error, styles.tileError]}>{errors.exec}</Text> : null}
              </View>

              {/* Deadline — a calendar wearing a small clock. */}
              <View style={styles.tileCol}>
                <PressableScale
                  style={[styles.dateSquare, deadline ? styles.dateSquareSel : null, errors.deadline ? styles.dateSquareErr : null]}
                  onPress={() => setCalOpen('deadline')}
                  activeScale={0.96}
                  testID="tile-deadline"
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
                  <View style={styles.deadlineIcon}>
                    <CalendarDays size={19} color={deadline ? VIOLET : INK_2} strokeWidth={1.8} />
                    <View style={[styles.deadlineClock, deadline ? styles.deadlineClockSel : null]}>
                      <Clock size={9} color={deadline ? VIOLET : INK_2} strokeWidth={2.4} />
                    </View>
                  </View>
                  <Text style={[deadline ? styles.dateSquareValue : styles.dateSquarePlaceholder, font.regular]} numberOfLines={2}>
                    {deadline === 'flexible' ? t('builder.flexible') : (deadline ? formatIsoDay(deadline) : t('builder.placeholder_deadline'))}
                  </Text>
                </PressableScale>
                {errors.deadline ? <Text style={[styles.error, styles.tileError]}>{errors.deadline}</Text> : null}
              </View>

              {/* Location */}
              <View style={styles.tileCol}>
                <PressableScale
                  style={[styles.dateSquare, location ? styles.dateSquareSel : null, errors.location ? styles.dateSquareErr : null]}
                  onPress={() => { setLocationSearch(''); setLocationModalOpen(true); }}
                  activeScale={0.96}
                  testID="tile-location"
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
                  <Text style={[location ? styles.dateSquareValue : styles.dateSquarePlaceholder, font.regular]} numberOfLines={2}>
                    {location || t('builder.placeholder_location')}
                  </Text>
                </PressableScale>
                {errors.location ? <Text style={[styles.error, styles.tileError]}>{errors.location}</Text> : null}
              </View>
            </View>

            {/* Skills */}
            <Text style={[styles.label, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
              {t('builder.select_roles')}
            </Text>
            {skillsLoading ? (
              <ActivityIndicator color={VIOLET} style={{ marginVertical: 12 }} />
            ) : skillOptions.length === 0 ? (
              <Text style={[styles.emptySkills, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}>
                {t('builder.no_skills_listed')}
              </Text>
            ) : (
              <View style={styles.skillsGrid}>
                {skillOptions.map((o, i) => {
                  const qty = getQty(o.id);
                  // Role header whenever the role changes, so several skills of
                  // one role read as a block rather than a flat list.
                  const showRole = i === 0 || skillOptions[i - 1].roleLabel !== o.roleLabel;
                  return (
                    <View key={o.id}>
                      {showRole && (
                        <Text style={[styles.skillGroupLabel, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
                          {o.roleLabel}
                        </Text>
                      )}
                      <View style={[styles.skillRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                        <Text style={[styles.skillLabel, { ...font.medium, color: TEXT, flex: 1, textAlign: rtl ? 'right' : 'left' }]}>
                          {o.skillLabel}
                        </Text>
                        <View style={[styles.qtyControls, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                          {qty > 0 && (
                            <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(o.id, -1)} hitSlop={8} activeOpacity={0.7}>
                              <Text style={[styles.qtyBtnText, { color: MUTED_LABEL }]}>−</Text>
                            </TouchableOpacity>
                          )}
                          {qty > 0 && (
                            <View style={styles.qtyBadge}>
                              <Text style={styles.qtyBadgeText}>{qty}</Text>
                            </View>
                          )}
                          <TouchableOpacity style={[styles.qtyBtn, styles.qtyBtnAdd]} onPress={() => setQty(o.id, 1)} hitSlop={8} activeOpacity={0.7}>
                            <Text style={[styles.qtyBtnText, { color: VIOLET }]}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            {errors.slots ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.slots}</Text> : null}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, isSubmitting && styles.disabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              <Text style={[styles.submitText, { ...font.bold }]}>
                {isSubmitting ? t('builder.submitting') : t('search.tell_us_about_project')}
              </Text>
            </TouchableOpacity>

            <View style={{ height: 8 }} />
          </ScrollView>
        </View>
      </View>

      {/* Location picker — mirrors the home builder's modal, same list and rows. */}
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
                <View style={styles.locationNav}>
                  <Text style={[styles.locationNavTitle, { ...font.bold }]}>
                    {t('builder.location')}
                  </Text>
                  <TouchableOpacity onPress={() => setLocationModalOpen(false)} hitSlop={12} activeOpacity={0.7}>
                    <X size={18} color={VIOLET} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[styles.locationSearchInput, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
                  value={locationSearch}
                  onChangeText={setLocationSearch}
                  placeholder={rtlSafe(t('builder.search_city'), rtl)}
                  placeholderTextColor={PLACEHOLDER}
                  autoFocus
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />

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
                      <MapPin size={14} color={VIOLET} strokeWidth={1.8} />
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
                      <MapPin size={14} color={VIOLET} strokeWidth={1.8} />
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
          // 'flexible' is a sentinel stored in the same field as a date, so every
          // read of `deadline` has to ask which it is before treating it as one.
          showFlexible={calOpen === 'deadline'}
          isFlexible={deadline === 'flexible'}
          onFlexible={() => { setDeadline(deadline === 'flexible' ? '' : 'flexible'); setCalOpen(null); }}
          flexibleLabel={t('builder.flexible')}
          // Neither date may be in the past, and the deadline may not fall BEFORE
          // the execution date. Both bounds are inclusive, so the two may be the
          // same day — a shoot delivered the day it happens is a real case, and
          // this matches the home builder (home/index.tsx:723-724). Each picker
          // bounds the other, so the pair cannot be put out of order at all.
          minDate={calOpen === 'exec' ? todayISO : (exec || todayISO)}
          maxDate={calOpen === 'exec' && hasDeadlineDate ? deadline : undefined}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Location modal — values copied from the home builder's picker so the two
  // read identically. KEEP IN SYNC with (client)/(tabs)/home/index.tsx.
  locationOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  locationBox: { width: 300, maxHeight: 420, borderRadius: 16, borderWidth: 2, borderColor: VIOLET, padding: 12, backgroundColor: '#ffffff' },
  locationNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  locationNavTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  locationSearchInput: { borderWidth: 1, borderColor: 'rgba(109,40,217,0.25)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, marginBottom: 6, color: TEXT },
  locationList: { maxHeight: 280 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  locationRowText: { fontSize: 14, fontWeight: '500', flex: 1, color: TEXT },
  locationSeparator: { height: 1, backgroundColor: VIOLET, opacity: 0.15 },
  locationAddRow: { borderTopWidth: 1, borderTopColor: HAIRLINE, marginTop: 4, paddingTop: 10 },
  locationAddText: { fontSize: 14, flex: 1, color: TEXT },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  // Centred white card, not a full-height gradient panel — PostListingSheet's
  // shell exactly: 440 cap, 85% height, radius 24, soft drop shadow.
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
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heading: { flex: 1, fontSize: 18, fontWeight: 'bold', color: TEXT, paddingRight: 8 },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1 },
  // Section titles are plain black — the violet borders and buttons carry the
  // colour, so the copy does not have to. Colour lives here, not inline at each
  // call site. One size for every section title (description, dates, location, roles).
  label: { fontSize: 15, lineHeight: 20, color: TEXT, marginTop: 10, marginBottom: 8 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: TEXT,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  multiline: { height: 96, textAlignVertical: 'top' },
  error: { fontSize: 12, color: '#fc8181', marginTop: 4 },
  tileRow: { gap: TILE_GAP, alignItems: 'flex-start', marginTop: 16 },
  tileCol: { flex: 1, alignItems: 'center' },
  tileError: { textAlign: 'center' },
  dateSquare: {
    backgroundColor: FIELD_FILL,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    borderRadius: 16,
    width: '100%',
    // 100, not 84: the execution square carries an extra "(optional)" line, and
    // the other two must stay the same height beside it.
    minHeight: 100,
    // Centred. The "(optional)" line is positioned over the top of the square
    // rather than stacked in the column, so the icon and text centre
    // identically in all three squares and sit on the same line.
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 11,
  },
  dateSquareSel: { borderWidth: 1.5, borderColor: TILE_SEL_BORDER, backgroundColor: TILE_SEL_FILL },
  dateSquareErr: { borderWidth: 1.5, borderColor: '#fc8181' },
  dateSquarePlaceholder: { fontSize: 12.5, lineHeight: 16, fontWeight: '400', color: TILE_PLACEHOLDER, textAlign: 'center' },
  dateSquareValue: { fontSize: 12.5, lineHeight: 16, fontWeight: '500', color: VIOLET, textAlign: 'center' },
  optionalTag: {
    position: 'absolute',
    top: 7,
    left: 0,
    right: 0,
    fontSize: 11,
    lineHeight: 14,
    color: TILE_PLACEHOLDER,
    textAlign: 'center',
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
  deadlineIcon: { width: 19, height: 19 },
  // Sits on the calendar's corner; the fill punches it out of the calendar's
  // lines so the two don't blur together.
  deadlineClock: {
    position: 'absolute',
    right: -4,
    bottom: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FIELD_FILL,
  },
  /** Matches dateSquareSel's fill once a deadline is picked. */
  deadlineClockSel: { backgroundColor: TILE_SEL_FILL },
  skillsGrid: { gap: 4, marginTop: 4 },
  skillGroupLabel: { fontSize: 12, color: '#8890b0', marginTop: 10, marginBottom: 2 },
  skillRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#6D28D922',
  },
  skillLabel: { fontSize: 15, fontWeight: '500' },
  qtyControls: { alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#6D28D944',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnAdd: { borderColor: VIOLET, backgroundColor: '#6D28D922' },
  qtyBtnText: { fontSize: 16, lineHeight: 18, fontWeight: '700' },
  qtyBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: VIOLET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  qtyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  emptySkills: { fontSize: 14, color: MUTED_LABEL, marginVertical: 8 },
  submitBtn: {
    backgroundColor: VIOLET,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  // Opacity, not a grey fill — the marketplace sheet's disabled treatment.
  disabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

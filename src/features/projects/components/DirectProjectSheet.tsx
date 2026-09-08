import { useMemo, useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, ActivityIndicator, TouchableWithoutFeedback,
} from 'react-native';
import { Calendar, MapPin, X } from 'lucide-react-native';
import { useAuthStore } from '@core/stores/authStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useGenerateTitle } from '@features/projects/hooks/useGenerateTitle';
import { MiniCalendar } from '@features/crew/components';
import { HelpTooltip } from '@components/ui/HelpTooltip';
import { addDocument, getDocument } from '@core/firebase/firestore';
import {
  ROLE_TO_LEGACY_CATEGORY, categoryLabel, getSpecializations, labelOf, capabilityOf,
} from '@features/crew/data/categories';
import { ISRAEL_LOCATIONS_HE, ISRAEL_LOCATIONS_EN } from '@core/constants/israelLocations';
import type { CrewRequestSlot } from '@core/types/project';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

// Palette taken from the marketplace's "post a listing" sheet, so the two
// full-screen forms read as one family: blue on white, muted grey section
// labels, no gradient. KEEP IN SYNC with PostListingSheet.tsx.
const BLUE = '#004aad';
const MUTED_LABEL = 'rgba(15,15,31,0.4)';
const PLACEHOLDER = 'rgba(15,15,31,0.4)';
const HAIRLINE = 'rgba(0,74,173,0.15)';

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

  const { generateTitle, isGenerating } = useGenerateTitle();

  // 'YYYY-MM-DD' strings compare lexicographically, which is why every date in
  // this codebase is stored that way — no Date maths needed to order them.
  const todayISO = useMemo(() => isoOf(new Date()), []);
  /** Both bounds are inclusive in MiniCalendar, so "strictly after" is expressed
   *  by shifting a day rather than by a different comparison. */
  const dayAfter = (iso: string) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + 1); return isoOf(d); };
  const dayBefore = (iso: string) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - 1); return isoOf(d); };

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

  // Title confirmation state
  const [titleModalVisible, setTitleModalVisible] = useState(false);
  const [pendingTitle, setPendingTitle] = useState('');
  const [titleFailed, setTitleFailed] = useState(false);

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
    setDescription('');
    setExec('');
    setDeadline('');
    setLocation('');
    setLocationSearch('');
    setLocationModalOpen(false);
    setQuantities({});
    setErrors({});
    setTitleModalVisible(false);
    setPendingTitle('');
    setTitleFailed(false);
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
    if (!description.trim()) next.description = t('builder.error_required');
    if (!deadline) next.deadline = t('builder.error_required');
    if (!location.trim()) next.location = t('builder.error_required');
    if (buildSlots().length === 0) next.slots = t('builder.error_role');
    // The pickers already prevent this pair; validated anyway so the invariant
    // does not depend solely on the UI that happens to set it.
    if (exec && exec < todayISO) next.exec = t('builder.error_date_past');
    if (hasDeadlineDate && deadline < todayISO) next.deadline = t('builder.error_date_past');
    if (exec && hasDeadlineDate && exec >= deadline) next.deadline = t('builder.error_deadline_order');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    try {
      const generated = await generateTitle(description);
      setPendingTitle(generated);
      setTitleFailed(false);
    } catch {
      setPendingTitle('');
      setTitleFailed(true);
    }
    setTitleModalVisible(true);
  }

  async function doSubmit(title: string) {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        clientId: user.id,
        title,
        description,
        exec: exec.trim() || undefined,
        deadline,
        location,
        crewSlots: buildSlots(),
        filledSlots: [],
        status: 'open',
        targetProfessionalId: professionalId,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      };
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
      await addDocument('projects', payload);
      setTitleModalVisible(false);
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
              <X size={20} color="#004aad" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.scroll}>
            {/* Description */}
            <Text style={[styles.label, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
              {t('builder.tell_us')}
            </Text>
            <TextInput
              style={[styles.input, styles.multiline, { color: '#1a1a2e', textAlign: rtl ? 'right' : 'left', fontSize: 13 }]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('builder.tell_us_placeholder')}
              placeholderTextColor={PLACEHOLDER}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {errors.description ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.description}</Text> : null}

            {/* Dates */}
            <View style={[styles.dateRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <View style={styles.dateCol}>
                <View style={[styles.dateLabelRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <Text
                    style={[styles.label, styles.labelFill, { ...font.semiBold, marginTop: 0, marginBottom: 6, fontSize: 13, lineHeight: 17, textAlign: rtl ? 'right' : 'left' }]}
                    numberOfLines={2}
                  >
                    {t('builder.execution')} <Text style={{ fontWeight: '400', color: 'rgba(0,74,173,0.55)' }}>({t('builder.optional')})</Text>
                  </Text>
                  <View style={styles.helpAnchor}>
                    <HelpTooltip text={t('builder.help_execution')} />
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.dateBtn, { flexDirection: rtl ? 'row-reverse' : 'row' }, errors.exec && { borderWidth: 1, borderColor: '#fc8181' }]}
                  onPress={() => setCalOpen('exec')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.dateBtnText, { ...font.regular, color: exec ? '#1a1a2e' : PLACEHOLDER, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                    {exec || t('builder.placeholder_date')}
                  </Text>
                  <Calendar size={14} color="#004aad" strokeWidth={1.8} />
                </TouchableOpacity>
                {errors.exec ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.exec}</Text> : null}
              </View>

              <View style={styles.dateCol}>
                <View style={[styles.dateLabelRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <Text
                    style={[styles.label, styles.labelFill, { ...font.semiBold, marginTop: 0, marginBottom: 6, fontSize: 13, lineHeight: 17, textAlign: rtl ? 'right' : 'left' }]}
                    numberOfLines={2}
                  >
                    {t('builder.deadline')}
                  </Text>
                  <View style={styles.helpAnchor}>
                    <HelpTooltip text={t('builder.help_deadline')} />
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.dateBtn, { flexDirection: rtl ? 'row-reverse' : 'row' }, errors.deadline && { borderWidth: 1, borderColor: '#fc8181' }]}
                  onPress={() => setCalOpen('deadline')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.dateBtnText, { ...font.regular, color: deadline ? '#1a1a2e' : PLACEHOLDER, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                    {deadline === 'flexible' ? t('builder.flexible') : (deadline || t('builder.placeholder_deadline'))}
                  </Text>
                  <Calendar size={14} color="#004aad" strokeWidth={1.8} />
                </TouchableOpacity>
                {errors.deadline ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.deadline}</Text> : null}
              </View>
            </View>

            {/* Location */}
            <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 6 }}>
              <Text style={[styles.label, { ...font.semiBold, marginTop: 0, marginBottom: 0, textAlign: rtl ? 'right' : 'left' }]}>
                {t('builder.location')}
              </Text>
              <HelpTooltip text={t('builder.help_location')} />
            </View>
            <TouchableOpacity
              style={[styles.dateBtn, { flexDirection: rtl ? 'row-reverse' : 'row' }, errors.location && { borderWidth: 1, borderColor: '#fc8181' }]}
              onPress={() => { setLocationSearch(''); setLocationModalOpen(true); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.dateBtnText, { ...font.regular, color: location ? '#1a1a2e' : PLACEHOLDER, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                {location || t('builder.placeholder_location')}
              </Text>
              <MapPin size={14} color="#004aad" strokeWidth={1.8} />
            </TouchableOpacity>
            {errors.location ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.location}</Text> : null}

            {/* Skills */}
            <Text style={[styles.label, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
              {t('builder.select_roles')}
            </Text>
            {skillsLoading ? (
              <ActivityIndicator color="#004aad" style={{ marginVertical: 12 }} />
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
                        <Text style={[styles.skillLabel, { ...font.medium, color: '#004aad', flex: 1, textAlign: rtl ? 'right' : 'left' }]}>
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
                            <Text style={[styles.qtyBtnText, { color: '#004aad' }]}>+</Text>
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
              style={[
                styles.submitBtn,
                isGenerating && styles.disabled,
              ]}
              onPress={handleSubmit}
              disabled={isGenerating}
              activeOpacity={0.8}
            >
              <Text style={[styles.submitText, { ...font.bold }]}>
                {isGenerating ? t('builder.generating_title') : t('search.tell_us_about_project')}
              </Text>
            </TouchableOpacity>

            <View style={{ height: 8 }} />
          </ScrollView>
        </View>
      </View>

      {/* Title confirmation modal */}
      <Modal visible={titleModalVisible} transparent animationType="fade" onRequestClose={() => setTitleModalVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.titleModal}>
            <Text style={[styles.titleModalHeading, { ...font.bold, textAlign: rtl ? 'right' : 'left' }]}>
              {t('builder.confirm_title')}
            </Text>
            <Text style={[styles.titleModalHint, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}>
              {titleFailed ? t('builder.title_failed') : t('builder.confirm_title_hint')}
            </Text>
            <TextInput
              style={[styles.input, { textAlign: rtl ? 'right' : 'left' }]}
              value={pendingTitle}
              onChangeText={setPendingTitle}
              placeholder={t('builder.confirm_title')}
              placeholderTextColor={PLACEHOLDER}
              autoFocus
            />
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!pendingTitle.trim() || isSubmitting) && styles.disabled,
                { marginTop: 16 },
              ]}
              onPress={() => doSubmit(pendingTitle.trim())}
              disabled={!pendingTitle.trim() || isSubmitting}
              activeOpacity={0.8}
            >
              <Text style={[styles.submitText, { ...font.bold }]}>
                {isSubmitting ? t('builder.submitting') : t('builder.looks_good')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setTitleModalVisible(false)}
              disabled={isSubmitting}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelText, { ...font.regular, color: MUTED_LABEL }]}>
                {t('project_details.cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
                    <X size={18} color="#004aad" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>

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
          // 'flexible' is a sentinel stored in the same field as a date, so every
          // read of `deadline` has to ask which it is before treating it as one.
          showFlexible={calOpen === 'deadline'}
          isFlexible={deadline === 'flexible'}
          onFlexible={() => { setDeadline(deadline === 'flexible' ? '' : 'flexible'); setCalOpen(null); }}
          flexibleLabel={t('builder.flexible')}
          // Neither date may be in the past, and the deadline must fall strictly
          // AFTER the execution date. Each picker bounds the other, so the pair
          // cannot be put into an invalid order in the first place — whichever
          // the client sets first constrains the second.
          minDate={calOpen === 'exec' ? todayISO : (exec ? dayAfter(exec) : todayISO)}
          maxDate={calOpen === 'exec' && hasDeadlineDate ? dayBefore(deadline) : undefined}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Location modal — values copied from the home builder's picker so the two
  // read identically. KEEP IN SYNC with (client)/(tabs)/home/index.tsx.
  locationOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  locationBox: { width: 300, maxHeight: 420, borderRadius: 16, borderWidth: 2, borderColor: '#004aad', padding: 12, backgroundColor: '#ffffff' },
  locationNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  locationNavTitle: { fontSize: 16, fontWeight: '700', color: '#004aad' },
  locationSearchInput: { borderWidth: 1, borderColor: 'rgba(0,74,173,0.25)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, marginBottom: 6, color: '#004aad' },
  locationList: { maxHeight: 280 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  locationRowText: { fontSize: 14, fontWeight: '500', flex: 1, color: '#004aad' },
  locationSeparator: { height: 1, backgroundColor: '#004aad', opacity: 0.15 },
  locationAddRow: { borderTopWidth: 1, borderTopColor: 'rgba(0,74,173,0.15)', marginTop: 4, paddingTop: 10 },
  locationAddText: { fontSize: 14, flex: 1, color: '#004aad' },
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
  heading: { flex: 1, fontSize: 18, fontWeight: 'bold', color: BLUE, paddingRight: 8 },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1 },
  // Section titles are BLUE here rather than the marketplace sheet's muted grey —
  // this form is longer and denser, and the blue is what separates one section
  // from the next. Colour lives here, not inline at each call site.
  label: { fontSize: 12, color: BLUE, marginTop: 10, marginBottom: 8 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1a1a2e',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  multiline: { height: 96, textAlignVertical: 'top' },
  error: { fontSize: 12, color: '#fc8181', marginTop: 4 },
  dateRow: { gap: 12, marginTop: 16 },
  /**
   * The label CLAIMS the row, pushing the "?" to its trailing end.
   *
   * With flexShrink the two columns disagreed: "Deadline" is short so its Text
   * hugged the word and the "?" sat right beside it, while "Execution
   * (optional)" wrapped to fill the column and pushed its "?" to the far edge —
   * two help buttons at two different positions. flex:1 makes both labels fill,
   * so both "?" land at the same place: the end of the title row.
   */
  labelFill: { flex: 1 },
  // Both date labels reserve two lines' height whether or not they use it.
  // "Execution (optional)" wraps in a half-width column while "Deadline" does
  // not, and content-height rows left the two date buttons on different lines.
  // 2 x lineHeight 17 + the label's 6pt marginBottom.
  dateLabelRow: { alignItems: 'center', gap: 6, minHeight: 40 },
  helpAnchor: { flexShrink: 0 },
  dateCol: { flex: 1 },
  // Same treatment as `input`, so the date and location triggers sit in the
  // same visual family as the text fields.
  dateBtn: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  dateBtnText: { fontSize: 15, flex: 1 },
  skillsGrid: { gap: 4, marginTop: 4 },
  skillGroupLabel: { fontSize: 12, color: '#8890b0', marginTop: 10, marginBottom: 2 },
  skillRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#004aad22',
  },
  skillLabel: { fontSize: 15, fontWeight: '500' },
  qtyControls: { alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#004aad44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnAdd: { borderColor: '#004aad', backgroundColor: '#004aad22' },
  qtyBtnText: { fontSize: 16, lineHeight: 18, fontWeight: '700' },
  qtyBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  qtyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  emptySkills: { fontSize: 14, color: MUTED_LABEL, marginVertical: 8 },
  submitBtn: {
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  // Opacity, not a grey fill — the marketplace sheet's disabled treatment.
  disabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 15 },
  titleModal: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  titleModalHeading: { fontSize: 18, fontWeight: 'bold', color: BLUE, marginBottom: 8 },
  titleModalHint: { fontSize: 13, color: MUTED_LABEL, marginBottom: 12 },
});

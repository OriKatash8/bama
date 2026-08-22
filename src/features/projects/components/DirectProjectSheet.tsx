import { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar } from 'lucide-react-native';
import { useAuthStore } from '@core/stores/authStore';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useGenerateTitle } from '@features/projects/hooks/useGenerateTitle';
import { MiniCalendar } from '@features/crew/components';
import { HelpTooltip } from '@components/ui/HelpTooltip';
import { addDocument, getDocument } from '@core/firebase/firestore';
import type { ProfessionalSkill } from '@core/types/user';
import type { CrewRequestSlot } from '@core/types/project';
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
  professionalId: string;
  professionalName: string;
  onClose: () => void;
  onSubmitted: () => void;
};

const webInputShadow = { boxShadow: '0 0 14px #7b4fd422, 0 0 28px #004aad14' } as object;

export function DirectProjectSheet({ visible, professionalId, professionalName, onClose, onSubmitted }: Props) {
  const user = useAuthStore((s) => s.user);
  const colors = useTheme();
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const { generateTitle, isGenerating } = useGenerateTitle();

  const [skills, setSkills] = useState<ProfessionalSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);

  const [description, setDescription] = useState('');
  const [exec, setExec] = useState('');
  const [deadline, setDeadline] = useState('');
  const [location, setLocation] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [calOpen, setCalOpen] = useState<'exec' | 'deadline' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Title confirmation state
  const [titleModalVisible, setTitleModalVisible] = useState(false);
  const [pendingTitle, setPendingTitle] = useState('');
  const [titleFailed, setTitleFailed] = useState(false);

  useEffect(() => {
    if (!visible || !professionalId) return;
    setSkillsLoading(true);
    getDocument<{ skills?: ProfessionalSkill[] }>(`users/${professionalId}/profile/data`)
      .then((profile) => setSkills(profile?.skills ?? []))
      .catch(() => setSkills([]))
      .finally(() => setSkillsLoading(false));
  }, [visible, professionalId]);

  function reset() {
    setDescription('');
    setExec('');
    setDeadline('');
    setLocation('');
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

  function skillKey(s: ProfessionalSkill) {
    return s.category;
  }

  function setQty(s: ProfessionalSkill, delta: number) {
    const key = skillKey(s);
    setQuantities((prev) => {
      const next = Math.max(0, (prev[key] ?? 0) + delta);
      return { ...prev, [key]: next };
    });
  }

  function getQty(s: ProfessionalSkill) {
    return quantities[skillKey(s)] ?? 0;
  }

  function buildSlots(): CrewRequestSlot[] {
    return skills
      .filter((s) => getQty(s) > 0)
      .map((s) => ({ category: s.category, quantity: getQty(s) }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!description.trim()) next.description = t('builder.error_required');
    if (!deadline) next.deadline = t('builder.error_required');
    if (!location.trim()) next.location = t('builder.error_required');
    if (buildSlots().length === 0) next.slots = t('builder.error_role');
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
        <LinearGradient
          colors={['#efd4f6', '#b7cae6']}
          style={styles.sheet}
        >
          {/* Header */}
          <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.heading, { ...font.bold, color: '#004aad', textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
              {professionalName}
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={12} activeOpacity={0.7}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.scroll}>
            {/* Description */}
            <Text style={[styles.label, { ...font.semiBold, color: '#7b2fa8', textAlign: rtl ? 'right' : 'left' }]}>
              {t('builder.tell_us')}
            </Text>
            <TextInput
              style={[styles.input, styles.multiline, { color: '#1a1a2e', textAlign: rtl ? 'right' : 'left', fontSize: 13 }, Platform.OS === 'web' && webInputShadow]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('builder.tell_us_placeholder')}
              placeholderTextColor="#7b2fa899"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {errors.description ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.description}</Text> : null}

            {/* Dates */}
            <View style={styles.dateRow}>
              <View style={styles.dateCol}>
                <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.label, { ...font.semiBold, color: '#7b2fa8', marginTop: 0, marginBottom: 6, fontSize: 13, textAlign: rtl ? 'right' : 'left' }]}>
                    {t('builder.execution')} <Text style={{ fontWeight: '400', color: '#7b2fa899' }}>({t('builder.optional')})</Text>
                  </Text>
                  <HelpTooltip text={t('builder.help_execution')} />
                </View>
                <TouchableOpacity
                  style={[styles.dateBtn, Platform.OS === 'web' && webInputShadow]}
                  onPress={() => setCalOpen('exec')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.dateBtnText, { ...font.regular, color: exec ? '#1a1a2e' : '#7b2fa899', textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                    {exec || t('builder.placeholder_date')}
                  </Text>
                  <Calendar size={14} color="#cb6ce6" strokeWidth={1.8} />
                </TouchableOpacity>
              </View>

              <View style={styles.dateCol}>
                <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.label, { ...font.semiBold, color: '#7b2fa8', marginTop: 0, marginBottom: 6, fontSize: 13, textAlign: rtl ? 'right' : 'left' }]}>
                    {t('builder.deadline')}
                  </Text>
                  <HelpTooltip text={t('builder.help_deadline')} />
                </View>
                <TouchableOpacity
                  style={[styles.dateBtn, errors.deadline && { borderWidth: 1, borderColor: '#fc8181' }, Platform.OS === 'web' && webInputShadow]}
                  onPress={() => setCalOpen('deadline')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.dateBtnText, { ...font.regular, color: deadline ? '#1a1a2e' : '#7b2fa899', textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                    {deadline || t('builder.placeholder_deadline')}
                  </Text>
                  <Calendar size={14} color="#cb6ce6" strokeWidth={1.8} />
                </TouchableOpacity>
                {errors.deadline ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.deadline}</Text> : null}
              </View>
            </View>

            {/* Location */}
            <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 6 }}>
              <Text style={[styles.label, { ...font.semiBold, color: '#7b2fa8', marginTop: 0, marginBottom: 0, textAlign: rtl ? 'right' : 'left' }]}>
                {t('builder.location')}
              </Text>
              <HelpTooltip text={t('builder.help_location')} />
            </View>
            <TextInput
              style={[styles.input, { color: '#1a1a2e', textAlign: rtl ? 'right' : 'left' }, Platform.OS === 'web' && webInputShadow]}
              value={location}
              onChangeText={setLocation}
              placeholder={t('builder.placeholder_location')}
              placeholderTextColor="#7b2fa899"
            />
            {errors.location ? <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>{errors.location}</Text> : null}

            {/* Skills */}
            <Text style={[styles.label, { ...font.semiBold, color: '#7b2fa8', textAlign: rtl ? 'right' : 'left' }]}>
              {t('builder.select_roles')}
            </Text>
            {skillsLoading ? (
              <ActivityIndicator color="#cb6ce6" style={{ marginVertical: 12 }} />
            ) : skills.length === 0 ? (
              <Text style={[styles.emptySkills, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}>
                No skills listed for this professional.
              </Text>
            ) : (
              <View style={styles.skillsGrid}>
                {skills.map((s) => {
                  const qty = getQty(s);
                  return (
                    <View key={skillKey(s)} style={[styles.skillRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                      <Text style={[styles.skillLabel, { ...font.medium, color: '#004aad', flex: 1, textAlign: rtl ? 'right' : 'left' }]}>
                        {s.category}
                      </Text>
                      <View style={[styles.qtyControls, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                        {qty > 0 && (
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(s, -1)} hitSlop={8} activeOpacity={0.7}>
                            <Text style={[styles.qtyBtnText, { color: colors.textMuted }]}>−</Text>
                          </TouchableOpacity>
                        )}
                        {qty > 0 && (
                          <View style={styles.qtyBadge}>
                            <Text style={styles.qtyBadgeText}>{qty}</Text>
                          </View>
                        )}
                        <TouchableOpacity style={[styles.qtyBtn, styles.qtyBtnAdd]} onPress={() => setQty(s, 1)} hitSlop={8} activeOpacity={0.7}>
                          <Text style={[styles.qtyBtnText, { color: '#004aad' }]}>+</Text>
                        </TouchableOpacity>
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
                Platform.OS === 'web' && ({ background: isGenerating ? '#004aad' : 'linear-gradient(to right, #004aad, #cb6ce6)' } as object),
              ]}
              onPress={handleSubmit}
              disabled={isGenerating}
              activeOpacity={0.8}
            >
              <Text style={[styles.submitText, { ...font.bold }]}>
                {isGenerating ? t('builder.generating_title') : t('search.tell_us_about_project')}
              </Text>
            </TouchableOpacity>

            <View style={{ height: 32 }} />
          </ScrollView>
        </LinearGradient>
      </View>

      {/* Title confirmation modal */}
      <Modal visible={titleModalVisible} transparent animationType="fade" onRequestClose={() => setTitleModalVisible(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.titleModal, { backgroundColor: colors.card, borderColor: colors.accent }, Platform.OS === 'web' && ({ boxShadow: '0 0 48px #7b4fd488' } as object)]}>
            <Text style={[styles.titleModalHeading, { ...font.bold, color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
              {t('builder.confirm_title')}
            </Text>
            <Text style={[styles.titleModalHint, { ...font.regular, color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
              {titleFailed ? t('builder.title_failed') : t('builder.confirm_title_hint')}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, textAlign: rtl ? 'right' : 'left', backgroundColor: '#ffffff' }, Platform.OS === 'web' && webInputShadow]}
              value={pendingTitle}
              onChangeText={setPendingTitle}
              placeholder={t('builder.confirm_title')}
              placeholderTextColor="#7b2fa899"
              autoFocus
            />
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!pendingTitle.trim() || isSubmitting) && styles.disabled,
                Platform.OS === 'web' && ({ background: (!pendingTitle.trim() || isSubmitting) ? '#004aad' : 'linear-gradient(to right, #004aad, #cb6ce6)' } as object),
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
              <Text style={[styles.cancelText, { ...font.regular, color: colors.textMuted }]}>
                {t('project_details.cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {calOpen !== null && (
        <MiniCalendar
          value={calOpen === 'exec' ? exec : deadline}
          onSelect={(d) => {
            if (calOpen === 'exec') setExec(d);
            else setDeadline(d);
            setCalOpen(null);
          }}
          onClose={() => setCalOpen(null)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 24,
    maxHeight: '90%',
    flex: 1,
    overflow: 'hidden',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: '800',
    flex: 1,
  },
  closeBtn: {
    fontSize: 18,
    color: '#7b2fa8',
    fontWeight: '600',
    paddingLeft: 12,
  },
  scroll: { flex: 1 },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    borderWidth: 0,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#ffffff',
  },
  multiline: { height: 96, textAlignVertical: 'top' },
  error: { fontSize: 12, color: '#fc8181', marginTop: 4 },
  dateRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  dateCol: { flex: 1 },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
    backgroundColor: '#ffffff',
  },
  dateBtnText: { fontSize: 13, flex: 1 },
  skillsGrid: { gap: 4, marginTop: 4 },
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
  emptySkills: { fontSize: 14, color: '#7b2fa8', marginVertical: 8 },
  submitBtn: {
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  disabled: { backgroundColor: '#555' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 15 },
  titleModal: { width: '100%', borderRadius: 24, borderWidth: 2, padding: 24 },
  titleModalHeading: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  titleModalHint: { fontSize: 14, marginBottom: 12 },
});

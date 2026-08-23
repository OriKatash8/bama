import { useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, TextInput, Switch, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';

const LOCATION_ICON = require('../../../../assets/images/location-icon.png');
import { X } from 'lucide-react-native';
import type { ProjectRequest, CrewRequestSlot } from '@core/types/project';
import { usePriceOffer } from '@features/noticeboard/hooks/usePriceOffer';
import { getVacantSlots } from '@features/noticeboard/hooks/useNoticeboard';
import { CATEGORY_QUESTION_MAP, ROLE_QUESTIONS, questionLabel } from '@features/projects/constants/roleQuestions';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { CATEGORY_LABEL_KEY } from '@features/crew/data/categories';
import { capabilityLabel } from '@features/noticeboard/matching';
import { translateCity } from '@core/utils/cityTranslations';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    if (typeof result !== 'string') return key;
    if (!vars) return result;
    return result.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
  };
}

type BidEntry = CrewRequestSlot & { selected: boolean; price: string };

type Props = {
  request: ProjectRequest | null;
  onClose: () => void;
  onApply: () => void;
  onDismiss: () => void;
  isApplying: boolean;
  initialView?: 'details' | 'bid';
  professionalCategories?: string[];
};

export function ProjectDetailModal({ request, onClose, onApply, onDismiss, initialView = 'details', professionalCategories }: Props) {
  const { submit, submitWithBundle, isSubmitting } = usePriceOffer();
  const colors = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();

  const [view, setView] = useState<'details' | 'bid' | 'bundle'>('details');
  const [bids, setBids] = useState<BidEntry[]>([]);
  const [bundlePrice, setBundlePrice] = useState('');
  const [bundleError, setBundleError] = useState('');

  useEffect(() => {
    if (request) {
      if (initialView === 'bid') {
        setBids(getVacantSlots(request).map((s) => ({ ...s, selected: false, price: '' })));
        setView('bid');
      } else {
        setView('details');
        setBids([]);
      }
    }
  }, [request?.id, initialView]);

  if (!request) return null;

  function openBid() {
    setBids(getVacantSlots(request!).map((s) => ({ ...s, selected: false, price: '' })));
    setView('bid');
  }

  function toggleSelected(i: number) {
    setBids((prev) => prev.map((b, idx) => (idx === i ? { ...b, selected: !b.selected } : b)));
  }

  function setPrice(i: number, value: string) {
    setBids((prev) => prev.map((b, idx) => (idx === i ? { ...b, price: value } : b)));
  }

  const validBids = bids.filter((b) => b.selected && Number(b.price) > 0);
  const individualTotal = validBids.reduce((sum, b) => sum + Number(b.price), 0);
  const canSubmit = validBids.length > 0 && !isSubmitting;

  function handleBidSubmit() {
    if (validBids.length >= 2) {
      setBundlePrice('');
      setBundleError('');
      setView('bundle');
    } else {
      void doSubmitIndividual();
    }
  }

  async function doSubmitIndividual() {
    try {
      await submit(
        request!.id,
        validBids.map((b) => ({ category: b.category, price: Number(b.price) }))
      );
      setView('details');
      onApply();
    } catch {
      // error handled by hook
    }
  }

  async function handleSkipBundle() {
    await doSubmitIndividual();
  }

  async function handleAddBundle() {
    const bp = Number(bundlePrice);
    if (!bundlePrice || isNaN(bp) || bp <= 0) {
      setBundleError(t('noticeboard.bundle_price_required'));
      return;
    }
    if (bp >= individualTotal) {
      setBundleError(t('noticeboard.bundle_price_error'));
      return;
    }
    setBundleError('');
    try {
      await submitWithBundle(
        request!.id,
        validBids.map((b) => ({ category: b.category, price: Number(b.price) })),
        bp,
      );
      setView('details');
      onApply();
    } catch {
      // error handled by hook
    }
  }

  function handleClose() {
    setView('details');
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />

        <View style={[styles.card, { maxHeight: screenHeight * 0.85 }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <AppText weight="bold" style={[styles.headerTitle, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
              {view === 'details'
                ? request.title
                : view === 'bid'
                  ? t('noticeboard.submit_offer_header')
                  : t('noticeboard.bundle_title')}
            </AppText>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <X size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ── Details view ── */}
          {view === 'details' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <AppText weight="semiBold" style={[styles.metaLabel, { color: colors.textMuted }]}>{t('noticeboard.execution_label')}</AppText>
                  <AppText weight="regular" style={styles.metaValue}>{request.exec ?? '—'}</AppText>
                </View>
                <View style={styles.metaItem}>
                  <AppText weight="semiBold" style={[styles.metaLabel, { color: colors.textMuted }]}>{t('noticeboard.deadline_label')}</AppText>
                  <AppText weight="regular" style={styles.metaValue}>{request.deadline ?? '—'}</AppText>
                </View>
                <View style={styles.metaItem}>
                  <AppText weight="semiBold" style={[styles.metaLabel, { color: colors.textMuted }]}>{t('noticeboard.location_label')}</AppText>
                  <View style={[styles.locationRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                    <Image
                      source={LOCATION_ICON}
                      style={[styles.locationIcon, { marginRight: rtl ? 0 : 4, marginLeft: rtl ? 4 : 0 }]}
                      resizeMode="contain"
                    />
                    <AppText weight="regular" style={styles.metaValue} numberOfLines={1}>{translateCity(request.location, rtl)}</AppText>
                  </View>
                </View>
              </View>

              <AppText weight="semiBold" style={[styles.sectionLabel, { color: colors.textMuted }]}>{t('noticeboard.description_label')}</AppText>
              <AppText weight="regular" style={[styles.description, { color: colors.textSec }]}>{request.description}</AppText>

              {(() => {
                const myRoleKeys = (professionalCategories ?? [])
                  .map(cat => CATEGORY_QUESTION_MAP[cat])
                  .filter((k): k is string => !!k);
                const myAnswers = Object.entries(request.roleAnswers ?? {})
                  .filter(([roleKey]) => myRoleKeys.includes(roleKey));
                if (myAnswers.length === 0) return null;
                return (
                  <View style={styles.roleAnswersSection}>
                    {myAnswers.flatMap(([roleKey, answers]) =>
                      Object.entries(answers).map(([questionId, value]) => {
                        const question = ROLE_QUESTIONS[roleKey]?.find(q => q.id === questionId);
                        if (!question) return null;
                        return (
                          <View key={`${roleKey}-${questionId}`} style={styles.roleAnswerChip}>
                            <AppText style={styles.roleAnswerChipText}>
                              {questionLabel(question, rtl)}: {value}
                            </AppText>
                          </View>
                        );
                      })
                    )}
                  </View>
                );
              })()}

              <AppText weight="semiBold" style={[styles.sectionLabel, { color: colors.textMuted }]}>{t('noticeboard.roles_needed')}</AppText>
              {getVacantSlots(request).map((s, i) => (
                <View key={i} style={styles.slotRow}>
                  <Text style={styles.slotQty}>{s.quantity}×</Text>
                  <View>
                    <AppText weight="semiBold" style={styles.slotSub}>
                      {rtl && CATEGORY_LABEL_KEY[s.category] ? t(CATEGORY_LABEL_KEY[s.category]) : s.category}
                    </AppText>
                    {s.requiredCapability ? (
                      <AppText weight="regular" style={styles.slotCap}>
                        {capabilityLabel(s.category, s.requiredCapability, rtl ? 'he' : 'en')}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              ))}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.applyBtn} onPress={openBid} activeOpacity={0.8}>
                  <AppText weight="bold" style={styles.applyText}>{t('noticeboard.make_offer_action')}</AppText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.8}>
                  <AppText weight="semiBold" style={styles.dismissText}>{t('noticeboard.not_interested')}</AppText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* ── Bid entry view ── */}
          {view === 'bid' && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}
            >
              <TouchableOpacity onPress={() => setView('details')} style={styles.backBtn}>
                <AppText style={styles.backText}>{t('noticeboard.back_to_details')}</AppText>
              </TouchableOpacity>
              <AppText style={[styles.bidHint, { color: colors.textMuted }]}>{t('noticeboard.bid_hint')}</AppText>

              {bids.map((b, i) => (
                <View key={i} style={styles.bidRow}>
                  <Switch
                    value={b.selected}
                    onValueChange={() => toggleSelected(i)}
                    trackColor={{ true: '#004aad' }}
                  />
                  <View style={styles.bidInfo}>
                    <AppText weight="semiBold" style={styles.bidSub}>
                      {rtl && CATEGORY_LABEL_KEY[b.category] ? t(CATEGORY_LABEL_KEY[b.category]) : b.category}
                    </AppText>
                    <AppText style={[styles.bidCat, { color: colors.textMuted }]}>
                      {b.quantity} {t('noticeboard.needed')}
                    </AppText>
                  </View>
                  {b.selected && (
                    <TextInput
                      style={styles.priceInput}
                      value={b.price}
                      onChangeText={(v) => setPrice(i, v)}
                      placeholder="₪"
                      placeholderTextColor="#aaa"
                      keyboardType="numeric"
                      maxLength={8}
                    />
                  )}
                </View>
              ))}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.applyBtn, !canSubmit && styles.disabled]}
                  onPress={handleBidSubmit}
                  disabled={!canSubmit}
                  activeOpacity={0.8}
                >
                  <AppText weight="bold" style={styles.applyText}>
                    {isSubmitting
                      ? t('noticeboard.sending')
                      : `${t('noticeboard.submit_offer_btn')} (${validBids.length} ${validBids.length === 1 ? t('noticeboard.role_singular') : t('noticeboard.role_plural')})`
                    }
                  </AppText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* ── Bundle prompt view ── */}
          {view === 'bundle' && (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
              <AppText style={[styles.bundleBody, { color: colors.textSec }]}>
                {t('noticeboard.bundle_body', { count: validBids.length })}
              </AppText>

              <View style={styles.bundleTotalRow}>
                <AppText weight="semiBold" style={[styles.bundleTotalLabel, { color: colors.textMuted }]}>{t('noticeboard.individual_total')}</AppText>
                <Text style={styles.bundleTotalValue}>₪{individualTotal.toLocaleString()}</Text>
              </View>

              <AppText weight="semiBold" style={[styles.metaLabel, { color: colors.textMuted, marginTop: 16, marginBottom: 6 }]}>
                {t('noticeboard.bundle_price_label')}
              </AppText>
              <TextInput
                style={[styles.priceInput, styles.bundlePriceInput, bundleError ? styles.inputError : undefined]}
                value={bundlePrice}
                onChangeText={(v) => { setBundlePrice(v); setBundleError(''); }}
                placeholder="₪"
                placeholderTextColor="#aaa"
                keyboardType="numeric"
                maxLength={10}
                autoFocus
              />
              {bundleError ? (
                <AppText style={styles.bundleErrorText}>{bundleError}</AppText>
              ) : null}

              <View style={styles.bundleRoles}>
                {validBids.map((b, i) => (
                  <AppText key={i} style={[styles.bundleRoleItem, { color: colors.textSec }]}>
                    · {rtl && CATEGORY_LABEL_KEY[b.category] ? t(CATEGORY_LABEL_KEY[b.category]) : b.category} — ₪{Number(b.price).toLocaleString()}
                  </AppText>
                ))}
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.applyBtn, isSubmitting && styles.disabled]}
                  onPress={handleAddBundle}
                  disabled={isSubmitting}
                  activeOpacity={0.8}
                >
                  <AppText weight="bold" style={styles.applyText}>
                    {isSubmitting ? t('noticeboard.sending') : t('noticeboard.add_bundle')}
                  </AppText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.skipBtn}
                  onPress={handleSkipBundle}
                  disabled={isSubmitting}
                  activeOpacity={0.7}
                >
                  <AppText style={[styles.skipText, { color: colors.textMuted }]}>
                    {t('noticeboard.skip_bundle')}
                  </AppText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    width: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    borderWidth: 3,
    borderColor: '#cb6ce6',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: '#004aad', paddingRight: 8 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  locationIcon: { width: 14, height: 14 },
  scrollContent: { paddingBottom: 8 },
  metaRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  metaItem: { flex: 1, backgroundColor: 'rgba(0,74,173,0.06)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(0,74,173,0.12)' },
  metaLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2, textTransform: 'uppercase' },
  metaValue: { fontSize: 13, color: '#004aad', fontWeight: '600' },
  sectionLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  description: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,74,173,0.08)' },
  slotQty: { fontSize: 18, fontWeight: '800', color: '#cb6ce6', width: 32 },
  slotSub: { fontSize: 15, fontWeight: '600', color: '#004aad' },
  slotCap: { fontSize: 12, color: '#7b2fa8', marginTop: 1 },
  slotCat: { fontSize: 12, marginTop: 1 },
  actions: { marginTop: 20, gap: 10 },
  applyBtn: { backgroundColor: '#004aad', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  disabled: { opacity: 0.4 },
  applyText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dismissBtn: { borderWidth: 1.5, borderColor: '#e53935', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  dismissText: { color: '#e53935', fontSize: 15, fontWeight: '600' },
  backBtn: { marginBottom: 12 },
  backText: { fontSize: 14, color: '#cb6ce6', fontWeight: '600' },
  bidHint: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  bidRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,74,173,0.08)' },
  bidInfo: { flex: 1 },
  bidSub: { fontSize: 15, fontWeight: '600', color: '#004aad' },
  bidCat: { fontSize: 12, marginTop: 2 },
  priceInput: { width: 72, borderWidth: 1, borderColor: 'rgba(0,74,173,0.3)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, textAlign: 'center', color: '#004aad', backgroundColor: 'rgba(0,74,173,0.04)' },
  // Bundle view
  bundleBody: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  bundleTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,74,173,0.06)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(0,74,173,0.12)' },
  bundleTotalLabel: { fontSize: 13, fontWeight: '600' },
  bundleTotalValue: { fontSize: 16, fontWeight: '800', color: '#004aad' },
  bundlePriceInput: { width: '100%', textAlign: 'left' },
  inputError: { borderColor: '#e53935' },
  bundleErrorText: { color: '#e53935', fontSize: 12, marginTop: 4 },
  bundleRoles: { marginTop: 16, gap: 4 },
  bundleRoleItem: { fontSize: 14 },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 15 },
  roleAnswersSection: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 },
  roleAnswerChip: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,74,173,0.08)',
    borderWidth: 1,
    borderColor: '#004aad',
  },
  roleAnswerChipText: { fontSize: 11, color: '#004aad' },
});

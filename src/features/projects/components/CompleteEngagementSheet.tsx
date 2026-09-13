import { useState } from 'react';
import {
  Modal, View, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { usePricingConfig } from '@features/pricing/hooks/usePricingConfig';
import { outstandingFee, isMinimumFee, feePercent, calculatedFee } from '@features/pricing/utils/fee';
import type { ProjectFee } from '@core/types/project';
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

/**
 * The professional confirms they have finished their part of a project.
 *
 * A REAL MODAL, not `confirmDialog`. That helper is `window.confirm` on web,
 * which cannot localise its two buttons and cannot show the fee at all — and
 * `Alert.alert` no-ops on web entirely. This is the step where a professional
 * accepts a charge, so every fact behind it has to be on screen before they tap:
 * what is owed, when it is taken, and that they can say it did not happen until
 * then.
 *
 * Says what it DOES, not what it asks for. Completion is this professional's own
 * decision now — nobody confirms it, the client is not consulted, and the copy
 * must not imply a pending approval that does not exist.
 *
 * Every number comes from the engagement's own snapshot or the runtime config;
 * none is written into a string.
 */
export function CompleteEngagementSheet({
  visible,
  projectTitle,
  fee,
  submitting,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  projectTitle: string;
  /** THIS professional's own engagement. Passed only on their own row — the
   *  client never holds this document and is never shown an amount (§6). */
  fee: ProjectFee | null;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  const pricing = usePricingConfig();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const align = rtl ? 'right' : 'left';

  // Priced from the engagement's OWN rate and floor, never from live config:
  // `feeRate` and `minFeeApplied` were snapshotted at hire precisely so a later
  // config change cannot reprice work already agreed. Before completion the
  // server has not written `feeDue` yet, which is why this derives rather than
  // reads (see outstandingFee).
  const owed = outstandingFee(fee);
  const onFloor = isMinimumFee(fee);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <AppText weight="bold" style={[styles.title, { color: colors.text, textAlign: align }]}>
              {t('engagement.complete_title')}
            </AppText>
            <AppText weight="regular" style={[styles.body, { color: colors.textMuted, textAlign: align }]}>
              {t('engagement.complete_body', { project: projectTitle })}
            </AppText>

            {/* The fee, stated before the tap rather than discovered after it. A
                zero-owed engagement (exempt, or already settled) shows no amount
                block at all — an empty ₪0 row reads as a bug. */}
            {owed > 0 && (
              <View style={styles.feeBox}>
                <AppText weight="semiBold" style={[styles.feeAmount, { color: colors.text, textAlign: align }]}>
                  {t('engagement.complete_fee', { amount: owed.toLocaleString() })}
                </AppText>
                <AppText weight="regular" style={[styles.feeNote, { color: colors.textMuted, textAlign: align }]}>
                  {onFloor
                    // The percentage alone is shown beside the floor so the
                    // arithmetic is visible: "3% of ₪100 is ₪3, the minimum is ₪6".
                    ? t('engagement.complete_fee_min', {
                        percent: String(feePercent(fee)),
                        calculated: calculatedFee(fee!).toLocaleString(),
                      })
                    : t('engagement.complete_fee_rate', { percent: String(feePercent(fee)) })}
                </AppText>
                <AppText weight="regular" style={[styles.feeNote, { color: colors.textMuted, textAlign: align }]}>
                  {t('engagement.complete_charge_when', { days: pricing.chargeWindowDays })}
                </AppText>
              </View>
            )}

            <AppText weight="regular" style={[styles.howBody, { color: colors.textMuted, textAlign: align }]}>
              {t('engagement.complete_contest_note', { days: pricing.chargeWindowDays })}
            </AppText>
            <AppText weight="regular" style={[styles.howBody, { color: colors.textMuted, textAlign: align }]}>
              {t('engagement.complete_others_note')}
            </AppText>

            <TouchableOpacity
              style={[styles.confirm, submitting && styles.confirmDisabled]}
              onPress={onConfirm}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#ffffff" size="small" />
                : <AppText weight="bold" style={styles.confirmText}>
                    {t('engagement.complete_confirm')}
                  </AppText>}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notNow}
              onPress={onClose}
              disabled={submitting}
              activeOpacity={0.7}
            >
              <AppText weight="regular" style={[styles.notNowText, { color: colors.textMuted }]}>
                {t('engagement.complete_not_now')}
              </AppText>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// The app's card convention, hardcoded per screen rather than themed — see the
// note on `card` in src/core/hooks/useTheme.tsx for why the token is not used.
const CARD_BORDER = 'rgba(30,79,163,0.07)';
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '85%',
  },
  title: { fontSize: 19, marginBottom: 6 },
  body: { fontSize: 14, marginBottom: 12, lineHeight: 20 },
  feeBox: {
    borderWidth: 1, borderRadius: 16, borderColor: CARD_BORDER,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, gap: 3,
  },
  feeAmount: { fontSize: 16 },
  feeNote: { fontSize: 12, lineHeight: 17 },
  howBody: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  confirm: {
    backgroundColor: '#004aad', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, marginTop: 8, minHeight: 50,
  },
  confirmDisabled: { opacity: 0.6 },
  confirmText: { fontSize: 15, color: '#ffffff' },
  notNow: { alignItems: 'center', paddingVertical: 14 },
  notNowText: { fontSize: 14 },
});

import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import { getDocument } from '@core/firebase/firestore';
import { confirmDialog } from '@utils/confirmDialog';
import { listenToProjectFee, paySlotFee } from '@features/pricing/services/feesService';
import { outstandingFee, feePercent } from '@features/pricing/utils/fee';
import type { ProjectFee, ProjectRequest } from '@core/types/project';
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
 * Settle one professional's platform fee on one project.
 *
 * Reached from three places — the project-detail pay action, the read-only chat
 * banner, and the blocked sheet — so it lives on its own route rather than
 * inside any of them.
 *
 * This is the ONLY screen besides the project-detail fee line where the amount
 * appears. The chat list never shows it.
 */
export default function PaymentScreen() {
  const router = useRouter();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const userId = useAuthStore((s) => s.user?.id);
  const showToast = useUiStore((s) => s.showToast);

  const { projectId } = useLocalSearchParams<{ projectId?: string }>();

  const [project, setProject] = useState<ProjectRequest | null>(null);
  const [fee, setFee] = useState<ProjectFee | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    let active = true;
    getDocument<ProjectRequest>(`projects/${projectId}`)
      .then((p) => { if (active) { setProject(p); setLoading(false); } })
      .catch((err) => {
        // Surfaced, not swallowed into a blank screen.
        console.error('[payment] project load failed:', err?.code, err);
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [projectId]);

  // Live, so the screen settles itself the moment the fee clears — including
  // when it is paid from another device.
  useEffect(() => {
    if (!projectId || !userId) return;
    return listenToProjectFee(projectId, userId, setFee);
  }, [projectId, userId]);

  const owed = outstandingFee(fee);
  const percent = feePercent(fee);
  const base = fee?.baseAmount ?? 0;

  async function handlePay() {
    if (!projectId || owed <= 0) return;
    const confirmed = await confirmDialog(
      t('project_details.pay_confirm_title'),
      t('project_details.pay_confirm_body', { amount: owed.toLocaleString() }),
    );
    if (!confirmed) return;
    setPaying(true);
    try {
      await paySlotFee({ projectId });
      showToast(t('project_details.pay_success'), 'success');
      router.back();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      console.error('[payment] payFee failed:', e?.code, e?.message, err);
      showToast(t('project_details.pay_error'), 'error');
    } finally {
      setPaying(false);
    }
  }

  const back = (
    <TouchableOpacity
      style={[styles.backRow, { flexDirection: rowDir }]}
      onPress={() => router.back()}
      activeOpacity={0.7}
      accessibilityRole="button"
      hitSlop={10}
    >
      {rtl
        ? <ChevronRight size={22} color={colors.primary} strokeWidth={2} />
        : <ChevronLeft size={22} color={colors.primary} strokeWidth={2} />}
      <AppText weight="bold" style={styles.title}>
        {t('project_details.pay_title')}
      </AppText>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <Screen style={styles.content}>
        {back}
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </Screen>
    );
  }

  if (!projectId || !project) {
    return (
      <Screen style={styles.content}>
        {back}
        <AppText weight="regular" style={[styles.emptyNote, { color: colors.textMuted }]}>
          {t('project_details.pay_not_found')}
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen style={styles.content} scrollable>
      {back}

      <AppText weight="semiBold" style={[styles.projectTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
        {project.title}
      </AppText>

      {owed <= 0 ? (
        <View style={styles.card}>
          <AppText weight="semiBold" style={[styles.settled, { color: '#2d6a2d' }]}>
            {t('project_details.pay_nothing_owed')}
          </AppText>
        </View>
      ) : (
        <>
          {/* Amount, large — with the breakdown directly beneath it so the
              number is never presented without saying what it is 3% of. */}
          <View style={styles.card}>
            <AppText weight="regular" style={[styles.amountLabel, { color: colors.textMuted }]}>
              {t('project_details.pay_amount_label')}
            </AppText>
            <AppText weight="bold" style={[styles.amount, { color: colors.primary }]}>
              ₪{owed.toLocaleString()}
            </AppText>
            <AppText weight="regular" style={[styles.breakdown, { color: colors.textMuted }]}>
              {t('project_details.pay_breakdown', { percent, base: base.toLocaleString() })}
            </AppText>
          </View>

          {/* What the money buys. Both levers from the spec, stated plainly. */}
          <View style={styles.card}>
            <AppText weight="semiBold" style={[styles.unlocksTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
              {t('project_details.pay_unlocks_title')}
            </AppText>
            {[t('project_details.pay_unlocks_slot'), t('project_details.pay_unlocks_review')].map((line) => (
              <View key={line} style={[styles.unlockRow, { flexDirection: rowDir }]}>
                <Check size={16} color="#2d6a2d" strokeWidth={2.5} />
                <AppText weight="regular" style={[styles.unlockText, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                  {line}
                </AppText>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.payButton, paying && styles.payButtonDisabled]}
            onPress={handlePay}
            disabled={paying}
            activeOpacity={0.85}
          >
            {paying
              ? <ActivityIndicator color="#ffffff" size="small" />
              : <AppText weight="bold" style={styles.payButtonText}>
                  {t('project_details.pay_button', { amount: owed.toLocaleString() })}
                </AppText>}
          </TouchableOpacity>
        </>
      )}
    </Screen>
  );
}

// The app's card convention, hardcoded per screen rather than themed — see the
// note on `card` in src/core/hooks/useTheme.tsx for why the token is not used.
const CARD_SHADOW = {
  shadowColor: '#1e4fa3',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
} as const;
const CARD_BORDER = 'rgba(30,79,163,0.07)';
const HEADING_BLUE = '#1e4fa3';

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16 },
  backRow: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  title: { fontSize: 18, color: HEADING_BLUE },
  projectTitle: { fontSize: 15, marginBottom: 12 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    ...CARD_SHADOW,
  },
  amountLabel: { fontSize: 13 },
  amount: { fontSize: 40, lineHeight: 48 },
  breakdown: { fontSize: 13 },
  unlocksTitle: { fontSize: 14, alignSelf: 'stretch', marginBottom: 6 },
  unlockRow: { alignItems: 'center', gap: 8, alignSelf: 'stretch', paddingVertical: 3 },
  unlockText: { fontSize: 13, flex: 1 },
  // Blue, not green: this is the pay ACTION. Green on this screen is reserved for
  // affirmative state — "nothing owed", and the checkmarks listing what payment
  // unlocks — so the button must not share it.
  payButton: {
    backgroundColor: '#004aad', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginTop: 4,
  },
  payButtonDisabled: { opacity: 0.6 },
  payButtonText: { fontSize: 16, color: '#ffffff' },
  settled: { fontSize: 15 },
  emptyNote: { fontSize: 14, marginTop: 40, textAlign: 'center' },
});

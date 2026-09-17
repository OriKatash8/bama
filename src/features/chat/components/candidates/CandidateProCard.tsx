import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@components/ui/AppText';
import { useUiStore } from '@core/stores/uiStore';
import { confirmDialog } from '@utils/confirmDialog';
import type { BundleOffer, PaymentRequest, PriceOffer } from '@core/types/project';
import { createPaymentRequest } from '../../services/paymentService';
import {
  acknowledgeCandidacy, declineCandidacy, listenToAcceptedOffers, listenToMyPriceRequestHistory,
  proHasAcknowledged, proPrice, proReviewState, rolesProMayReprice, type ReviewRole,
} from '../../services/candidateService';
import { repriceErrorKey } from '../../utils/repriceErrors';
import { useCandidateText } from './useCandidateText';
import { chromeStyles } from './chromeStyles';
import { ActionButton } from './ActionButton';
import { PriceChangeSheet } from './PriceChangeSheet';

type Busy = 'acknowledge' | 'decline' | 'price';

/** Translation key for a failed professional-side decision. */
export function proCandidateErrorKey(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? '');
  if (msg.includes('not-under-review')) return 'candidate_review.pro_err_not_under_review';
  if (msg.includes('engagement-not-open')) return 'candidate_review.pro_err_engagement_not_open';
  return 'candidate_review.err_generic';
}

/**
 * The professional's side of the review, pinned under the chat header.
 *
 * PRO ONLY — ChatRoomScreen mounts it when the viewer is not the project's
 * client. Replaces the passive status chip; its states:
 *
 *   under review, not yet acknowledged → price line + רלוונטי / לא רלוונטי / שינוי מחיר
 *   under review, acknowledged         → amber "waiting for the client" + a note that
 *                                        price changes are now respond-only (the
 *                                        button is gone; the note says why)
 *   confirmed by the client            → green chip, until the project goes in_progress
 *
 * שינוי מחיר is enabled only for roles the server would accept a request on
 * (client mirror of priceRequestPolicy), so it never taps into a refusal.
 * Hires from before candidate review carry no `review` and get nothing.
 */
export function CandidateProCard({
  projectId,
  chatId,
  proId,
  projectStatus,
}: {
  projectId: string;
  chatId: string;
  proId: string;
  projectStatus: string | undefined;
}) {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const { t, lang, align, rowDir, money } = useCandidateText();
  const [accepted, setAccepted] = useState<{ offers: PriceOffer[]; bundles: BundleOffer[] } | null>(null);
  const [history, setHistory] = useState<PaymentRequest[]>([]);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [repricing, setRepricing] = useState(false);

  useEffect(() => listenToAcceptedOffers(projectId, proId, setAccepted), [projectId, proId]);
  useEffect(() => listenToMyPriceRequestHistory(projectId, proId, setHistory), [projectId, proId]);

  const state = accepted ? proReviewState(accepted.offers, accepted.bundles) : null;
  const price = useMemo(
    () => (accepted ? proPrice(accepted.offers, accepted.bundles, lang) : { roles: [], total: 0 }),
    [accepted, lang],
  );
  const repriceable = useMemo<ReviewRole[]>(
    () => (accepted ? rolesProMayReprice(accepted.offers, accepted.bundles, history, proId, lang) : []),
    [accepted, history, proId, lang],
  );

  if (projectStatus !== 'open' || !state || !accepted) return null;

  const pendingRequests = history.filter((r) => r.status === 'pending' && r.professionalId === proId);
  const clientAsked = pendingRequests.some((r) => r.toUserId === proId);
  const iAsked = !clientAsked && pendingRequests.some((r) => r.fromUserId === proId);
  const underReview = state === 'pending';
  const acknowledged = underReview && proHasAcknowledged(accepted.offers, accepted.bundles);
  const actionable = underReview && !acknowledged;

  const run = async (kind: Busy, fn: () => Promise<void>) => {
    setBusy(kind);
    try { await fn(); } finally { setBusy(null); }
  };

  const onRelevant = async () => {
    const ok = await confirmDialog(
      t('candidate_review.pro_confirm_title'),
      t('candidate_review.pro_confirm_body'),
      { confirm: t('candidate_review.pro_confirm_ok'), cancel: t('candidate_review.cancel'), destructive: false },
    );
    if (!ok) return;
    await run('acknowledge', async () => {
      try {
        await acknowledgeCandidacy(projectId);
        showToast(t('candidate_review.pro_confirmed_toast'), 'success');
      } catch (err) {
        showToast(t(proCandidateErrorKey(err)), 'error');
      }
    });
  };

  const onNotRelevant = async () => {
    const ok = await confirmDialog(
      t('candidate_review.pro_decline_title'),
      t('candidate_review.pro_decline_body'),
      { confirm: t('candidate_review.pro_decline_ok'), cancel: t('candidate_review.cancel'), destructive: true },
    );
    if (!ok) return;
    await run('decline', async () => {
      try {
        await declineCandidacy(projectId);
        showToast(t('candidate_review.pro_declined_toast'), 'success');
      } catch (err) {
        showToast(t(proCandidateErrorKey(err)), 'error');
      }
    });
  };

  const onPrice = async (role: ReviewRole, amount: number, note: string) => {
    await run('price', async () => {
      try {
        // No professionalId: the server takes the caller as the professional.
        await createPaymentRequest(projectId, {
          ...(role.bundleId ? { bundleId: role.bundleId } : { category: role.category }),
          proposedAmount: amount,
          note: note || undefined,
        });
        setRepricing(false);
        showToast(t('candidate_review.price_sent', { name: t('candidate_review.pro_client') }), 'success');
      } catch (err) {
        showToast(t(repriceErrorKey(err, 'create')), 'error');
      }
    });
  };

  const openPayments = () => router.push(
    `/(client)/(tabs)/chats/project-details?projectId=${projectId}&chatId=${chatId}&section=payments` as never,
  );

  return (
    <View style={chromeStyles.strip} testID="candidate-pro-card">
      <View style={[styles.line, { flexDirection: rowDir }]}>
        {!actionable && (
          <View style={[styles.pill, underReview ? styles.pillPending : styles.pillConfirmed]} testID={`chip-${state}`}>
            <AppText weight="semiBold" style={[styles.pillText, underReview ? styles.pillTextPending : styles.pillTextConfirmed]}>
              {underReview ? t('candidate_review.chip_pending') : t('candidate_review.chip_confirmed')}
            </AppText>
          </View>
        )}
        <AppText weight="regular" numberOfLines={1} style={[styles.price, { textAlign: align }]} testID="chip-price">
          {t('candidate_review.chip_your_price', { price: money(price.total) })}
          {price.roles.length > 1 ? ` · ${price.roles.map((r) => r.label).join(' · ')}` : ''}
        </AppText>
      </View>

      {acknowledged && (
        <AppText weight="regular" style={[styles.note, { textAlign: align }]} testID="pro-acknowledged-note">
          {t('candidate_review.pro_acknowledged_note')}
        </AppText>
      )}
      {clientAsked && (
        <TouchableOpacity testID="chip-client-asked" accessibilityRole="link" activeOpacity={0.7} onPress={openPayments}>
          <AppText weight="semiBold" style={[styles.action, { textAlign: align }]}>
            {t('candidate_review.chip_client_asked')}
          </AppText>
        </TouchableOpacity>
      )}
      {iAsked && (
        <AppText weight="regular" style={[styles.note, { textAlign: align }]} testID="chip-waiting-client">
          {t('candidate_review.chip_waiting_client')}
        </AppText>
      )}

      {actionable && (
        <View style={[styles.actions, { flexDirection: rowDir }]} testID="pro-actions">
          <ActionButton
            testID="pro-relevant"
            label={t('candidate_review.relevant')}
            variant="primary"
            disabled={!!busy}
            loading={busy === 'acknowledge'}
            onPress={onRelevant}
          />
          <ActionButton
            testID="pro-not-relevant"
            label={t('candidate_review.not_relevant')}
            variant="danger"
            disabled={!!busy}
            loading={busy === 'decline'}
            onPress={onNotRelevant}
          />
          <ActionButton
            testID="pro-price"
            label={t('candidate_review.change_price')}
            variant="outline"
            disabled={!!busy || pendingRequests.length > 0 || repriceable.length === 0}
            loading={busy === 'price'}
            onPress={() => setRepricing(true)}
          />
        </View>
      )}

      <PriceChangeSheet
        visible={repricing}
        name={t('candidate_review.pro_client')}
        roles={repriceable}
        submitting={busy === 'price'}
        onSubmit={onPrice}
        onClose={() => setRepricing(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { alignItems: 'center', gap: 10, paddingVertical: 2 },
  pill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  pillPending: { backgroundColor: '#fff3cd' },
  pillConfirmed: { backgroundColor: '#e3f5ea' },
  pillText: { fontSize: 12 },
  pillTextPending: { color: '#8a5a00' },
  pillTextConfirmed: { color: '#1c7a4a' },
  price: { flex: 1, fontSize: 13, color: '#0f0f1f' },
  action: { fontSize: 12, color: '#004aad', marginTop: 4 },
  note: { fontSize: 12, color: 'rgba(15,15,31,0.55)', marginTop: 4 },
  actions: { gap: 8, marginTop: 8 },
});

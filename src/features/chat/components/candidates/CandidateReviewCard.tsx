import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@components/ui/AppText';
import { useUiStore } from '@core/stores/uiStore';
import { confirmDialog } from '@utils/confirmDialog';
import type { BundleOffer, PaymentRequest, PriceOffer } from '@core/types/project';
import { createPaymentRequest, listenToPaymentRequests } from '../../services/paymentService';
import {
  candidateErrorKey, confirmCandidate, groupPendingByPro, listenToAcceptedOffers, rejectCandidate,
  type PendingCandidate, type ReviewRole,
} from '../../services/candidateService';
import { repriceErrorKey } from '../../utils/repriceErrors';
import { useUserBasics, type UserBasics } from '../../hooks/useUserBasics';
import { useCandidateText } from './useCandidateText';
import { RejectCandidateSheet } from './RejectCandidateSheet';
import { PriceChangeSheet } from './PriceChangeSheet';
import { chromeStyles } from './chromeStyles';

type Busy = 'confirm' | 'reject' | 'price';

/**
 * The client's decision on each hired professional: רלוונטי / לא רלוונטי / שינוי מחיר.
 *
 * CLIENT ONLY — ChatRoomScreen mounts it only when the viewer is the project's
 * client. Pinned under the chat header as part of the header chrome, one row per
 * professional still under review. Renders nothing once nobody is.
 *
 * רלוונטי is DISABLED, with the reason on screen, while a price change for that
 * professional is pending on ANY of their roles — the same condition the server
 * refuses on, so the button can never be tapped into a `price-change-pending`
 * error except in a race.
 */
export function CandidateReviewCard({
  projectId,
  chatId,
  clientId,
}: {
  projectId: string;
  chatId: string;
  clientId: string;
}) {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const { t, lang, align, rowDir, money, dir } = useCandidateText();

  const [accepted, setAccepted] = useState<{ offers: PriceOffer[]; bundles: BundleOffer[] } | null>(null);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [busy, setBusy] = useState<Record<string, Busy | undefined>>({});
  const [rejecting, setRejecting] = useState<PendingCandidate | null>(null);
  const [repricing, setRepricing] = useState<PendingCandidate | null>(null);

  useEffect(() => listenToAcceptedOffers(projectId, null, setAccepted), [projectId]);
  useEffect(() => listenToPaymentRequests(projectId, clientId, setRequests), [projectId, clientId]);

  const candidates = useMemo(
    () => (accepted ? groupPendingByPro(accepted.offers, accepted.bundles, lang) : []),
    [accepted, lang],
  );
  const users = useUserBasics(candidates.map((c) => c.proId));

  if (candidates.length === 0) return null;

  const withBusy = async (proId: string, kind: Busy, run: () => Promise<void>) => {
    setBusy((b) => ({ ...b, [proId]: kind }));
    try { await run(); } finally { setBusy((b) => ({ ...b, [proId]: undefined })); }
  };

  const onRelevant = async (c: PendingCandidate, name: string) => {
    const ok = await confirmDialog(
      t('candidate_review.confirm_title', { name }),
      t('candidate_review.confirm_body', { name, price: money(c.total) }),
      { confirm: t('candidate_review.confirm_ok'), cancel: t('candidate_review.cancel'), destructive: false },
    );
    if (!ok) return;
    await withBusy(c.proId, 'confirm', async () => {
      try {
        await confirmCandidate(projectId, c.proId);
        showToast(t('candidate_review.confirmed_toast', { name }), 'success');
      } catch (err) {
        showToast(t(candidateErrorKey(err), { name }), 'error');
      }
    });
  };

  const onReject = async (reason: string) => {
    const c = rejecting;
    if (!c) return;
    const name = users[c.proId]?.displayName ?? '';
    await withBusy(c.proId, 'reject', async () => {
      try {
        const res = await rejectCandidate(projectId, c.proId, reason || undefined);
        setRejecting(null);
        if (reason && !res.dmSent) showToast(t('candidate_review.reject_dm_failed', { name }), 'error');
        else showToast(t('candidate_review.reject_done', { name }), 'success');
      } catch (err) {
        showToast(t(candidateErrorKey(err), { name }), 'error');
      }
    });
  };

  const onPrice = async (role: ReviewRole, amount: number, note: string) => {
    const c = repricing;
    if (!c) return;
    const name = users[c.proId]?.displayName ?? '';
    await withBusy(c.proId, 'price', async () => {
      try {
        await createPaymentRequest(projectId, {
          professionalId: c.proId,
          ...(role.bundleId ? { bundleId: role.bundleId } : { category: role.category }),
          proposedAmount: amount,
          note: note || undefined,
        });
        setRepricing(null);
        showToast(t('candidate_review.price_sent', { name }), 'success');
      } catch (err) {
        showToast(t(repriceErrorKey(err, 'create')), 'error');
      }
    });
  };

  const openPayments = () => router.push(
    `/(client)/(tabs)/chats/project-details?projectId=${projectId}&chatId=${chatId}&section=payments` as never,
  );

  const rows = candidates.map((c) => {
    const user = users[c.proId];
    // Unresolved (absent key) and unusable (null) both lock the row. Acting on a
    // professional whose name is not on screen is how the wrong one gets confirmed.
    const resolved: UserBasics | null = user ?? null;
    const name = resolved?.displayName ?? '';
    const pending = requests.filter((r) => r.status === 'pending' && r.professionalId === c.proId);
    // Waiting on the CLIENT outranks waiting on the pro: it is the one with an action.
    const waitingOnClient = pending.some((r) => r.fromUserId !== clientId);
    const waitingOnPro = !waitingOnClient && pending.length > 0;
    const blocked = pending.length > 0;
    const rowBusy = busy[c.proId];
    const canAct = !!resolved && !rowBusy;
    return (
      <View key={c.proId} style={styles.row} testID={`candidate-row-${c.proId}`}>
        <View style={[styles.identity, { flexDirection: rowDir }]} testID={`candidate-identity-${c.proId}`}>
          {resolved?.photoURL
            ? <Image source={{ uri: resolved.photoURL }} style={styles.avatar} />
            : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <AppText weight="bold" style={styles.avatarInitial}>{name ? name.charAt(0).toUpperCase() : ''}</AppText>
              </View>
            )}
          <View style={styles.identityText}>
            <AppText
              weight="semiBold"
              numberOfLines={1}
              style={[styles.name, { textAlign: align }, dir, !resolved && styles.namePlaceholder]}
              testID={`candidate-name-${c.proId}`}
            >
              {resolved ? name : t('candidate_review.name_loading')}
            </AppText>
            <AppText weight="regular" numberOfLines={1} style={[styles.roles, { textAlign: align }]}>
              {c.roles.map((r) => r.label).join(' · ')}
            </AppText>
          </View>
          <AppText weight="bold" style={styles.price}>{money(c.total)}</AppText>
        </View>

        {waitingOnPro && (
          <AppText weight="regular" style={[styles.status, { textAlign: align }, dir]} testID={`candidate-waiting-pro-${c.proId}`}>
            {t('candidate_review.waiting_on_pro', { name: name || t('candidate_review.name_loading') })}
          </AppText>
        )}
        {waitingOnClient && (
          <TouchableOpacity onPress={openPayments} accessibilityRole="link" testID={`candidate-answer-${c.proId}`} activeOpacity={0.7}>
            <AppText weight="semiBold" style={[styles.statusAction, { textAlign: align }, dir]}>
              {t('candidate_review.pro_countered', { name: name || t('candidate_review.name_loading') })}
            </AppText>
          </TouchableOpacity>
        )}

        <View style={[styles.actions, { flexDirection: rowDir }]} testID={`candidate-actions-${c.proId}`}>
          <ActionButton
            testID={`candidate-relevant-${c.proId}`}
            label={t('candidate_review.relevant')}
            variant="primary"
            disabled={!canAct || blocked}
            loading={rowBusy === 'confirm'}
            onPress={() => onRelevant(c, name)}
          />
          <ActionButton
            testID={`candidate-not-relevant-${c.proId}`}
            label={t('candidate_review.not_relevant')}
            variant="danger"
            disabled={!canAct}
            loading={rowBusy === 'reject'}
            onPress={() => setRejecting(c)}
          />
          <ActionButton
            testID={`candidate-price-${c.proId}`}
            label={t('candidate_review.change_price')}
            variant="outline"
            disabled={!canAct || blocked}
            loading={rowBusy === 'price'}
            onPress={() => setRepricing(c)}
          />
        </View>
      </View>
    );
  });

  return (
    <View style={chromeStyles.strip} testID="candidate-review-card">
      <AppText weight="semiBold" style={[styles.title, { textAlign: align }]}>{t('candidate_review.title')}</AppText>
      {candidates.length > 3
        ? <ScrollView style={styles.scrollCap} nestedScrollEnabled>{rows}</ScrollView>
        : rows}

      <RejectCandidateSheet
        visible={!!rejecting}
        name={rejecting ? users[rejecting.proId]?.displayName ?? '' : ''}
        submitting={!!rejecting && busy[rejecting.proId] === 'reject'}
        onConfirm={onReject}
        onClose={() => setRejecting(null)}
      />
      <PriceChangeSheet
        visible={!!repricing}
        name={repricing ? users[repricing.proId]?.displayName ?? '' : ''}
        roles={repricing?.roles ?? []}
        submitting={!!repricing && busy[repricing.proId] === 'price'}
        onSubmit={onPrice}
        onClose={() => setRepricing(null)}
      />
    </View>
  );
}

function ActionButton({
  label, variant, disabled, loading, onPress, testID,
}: {
  label: string;
  variant: 'primary' | 'danger' | 'outline';
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
  testID: string;
}) {
  const off = disabled || loading;
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      activeOpacity={0.8}
      style={[styles.btn, styles[variant], off && styles.btnDisabled]}
    >
      {loading
        ? <ActivityIndicator size="small" color={variant === 'primary' ? '#ffffff' : '#004aad'} />
        : <AppText weight="semiBold" numberOfLines={1} style={[styles.btnText, styles[`${variant}Text`]]}>{label}</AppText>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 12, color: 'rgba(15,15,31,0.5)', marginBottom: 6 },
  scrollCap: { maxHeight: 330 },
  row: { paddingVertical: 8, gap: 6 },
  identity: { alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: '#004aad22', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#004aad', fontSize: 15 },
  identityText: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, color: '#0f0f1f' },
  namePlaceholder: { color: 'rgba(15,15,31,0.35)' },
  roles: { fontSize: 12, color: 'rgba(15,15,31,0.55)' },
  price: { fontSize: 15, color: '#004aad' },
  status: { fontSize: 12, color: 'rgba(15,15,31,0.55)' },
  statusAction: { fontSize: 12, color: '#004aad' },
  actions: { gap: 8 },
  btn: { flex: 1, minHeight: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 13 },
  primary: { backgroundColor: '#004aad' },
  primaryText: { color: '#ffffff' },
  danger: { borderWidth: 1, borderColor: '#d64545' },
  dangerText: { color: '#d64545' },
  outline: { borderWidth: 1, borderColor: '#004aad55' },
  outlineText: { color: '#004aad' },
});

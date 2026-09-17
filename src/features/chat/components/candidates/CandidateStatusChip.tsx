import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@components/ui/AppText';
import type { BundleOffer, PaymentRequest, PriceOffer } from '@core/types/project';
import { listenToPaymentRequests } from '../../services/paymentService';
import { listenToAcceptedOffers, proPrice, proReviewState } from '../../services/candidateService';
import { useCandidateText } from './useCandidateText';
import { chromeStyles } from './chromeStyles';

/**
 * The professional's side of the review: where the client's decision stands, and
 * the price he is on.
 *
 * PRO ONLY — ChatRoomScreen mounts it when the viewer is not the project's client.
 * It is his only signal that he was confirmed (no push is sent for that), so it
 * shows amber while pending, green once confirmed, and goes away when the project
 * goes in_progress — the crew message in the chat takes over from there.
 *
 * Offers accepted before the review card existed carry no `review`, so a
 * professional on an older project sees no chip at all.
 */
export function CandidateStatusChip({
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
  const { t, lang, align, rowDir, money } = useCandidateText();
  const [accepted, setAccepted] = useState<{ offers: PriceOffer[]; bundles: BundleOffer[] } | null>(null);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);

  useEffect(() => listenToAcceptedOffers(projectId, proId, setAccepted), [projectId, proId]);
  useEffect(() => listenToPaymentRequests(projectId, proId, setRequests), [projectId, proId]);

  const state = accepted ? proReviewState(accepted.offers, accepted.bundles) : null;
  const price = useMemo(
    () => (accepted ? proPrice(accepted.offers, accepted.bundles, lang) : { roles: [], total: 0 }),
    [accepted, lang],
  );

  if (projectStatus !== 'open' || !state) return null;

  const mine = requests.filter((r) => r.status === 'pending' && r.professionalId === proId);
  const clientAsked = mine.some((r) => r.toUserId === proId);
  const iAsked = !clientAsked && mine.some((r) => r.fromUserId === proId);
  const pending = state === 'pending';

  return (
    <View style={chromeStyles.strip} testID="candidate-status-chip">
      <View style={[styles.line, { flexDirection: rowDir }]}>
        <View style={[styles.pill, pending ? styles.pillPending : styles.pillConfirmed]} testID={`chip-${state}`}>
          <AppText weight="semiBold" style={[styles.pillText, pending ? styles.pillTextPending : styles.pillTextConfirmed]}>
            {pending ? t('candidate_review.chip_pending') : t('candidate_review.chip_confirmed')}
          </AppText>
        </View>
        <AppText weight="regular" numberOfLines={1} style={[styles.price, { textAlign: align }]} testID="chip-price">
          {t('candidate_review.chip_your_price', { price: money(price.total) })}
          {price.roles.length > 1 ? ` · ${price.roles.map((r) => r.label).join(' · ')}` : ''}
        </AppText>
      </View>
      {clientAsked && (
        <TouchableOpacity
          testID="chip-client-asked"
          accessibilityRole="link"
          activeOpacity={0.7}
          onPress={() => router.push(
            `/(client)/(tabs)/chats/project-details?projectId=${projectId}&chatId=${chatId}&section=payments` as never,
          )}
        >
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
});

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
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
import { ActionButton } from './ActionButton';
import { carouselPanConfig, resolveShownIndex, slidePlan, SLIDE_MS } from './carousel';

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
  const { t, lang, rtl, align, rowDir, money, dir } = useCandidateText();

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

  // ── Carousel (2+ pending) — one professional at a time ──────────────────
  const [shownId, setShownId] = useState<string | null>(null);
  const lastIndexRef = useRef(0);
  const ids = candidates.map((c) => c.proId);
  const shownIndex = resolveShownIndex(ids, shownId, lastIndexRef.current);
  const carousel = candidates.length > 1;
  useEffect(() => { lastIndexRef.current = shownIndex; }, [shownIndex]);

  const go = (step: number) => {
    const next = Math.max(0, Math.min(shownIndex + step, ids.length - 1));
    if (next !== shownIndex) setShownId(ids[next]);
  };

  // ── Sliding ────────────────────────────────────────────────────────────
  // The card tracks the finger while dragging and is carried the rest of the
  // way on release; the chevrons play the same slide, so both gestures look
  // like the same strip of cards moving. JS driver throughout: the value is
  // both animated and written directly by the gesture, which the native driver
  // does not allow on one node.
  const [slide] = useState(() => new Animated.Value(0));
  const widthRef = useRef(0);
  const slidingRef = useRef(false);
  // One PanResponder is built on the first render, so everything it needs to
  // read at gesture time lives here, refreshed after each render.
  const live = useRef({
    rtl,
    atStart: true,
    atEnd: true,
    step: (_step: -1 | 1) => {},
  });

  const settle = () => Animated.timing(slide, { toValue: 0, duration: SLIDE_MS, useNativeDriver: false }).start();

  /** Carry the card off, swap in the next professional, bring him in. */
  const slideTo = (step: -1 | 1) => {
    if (slidingRef.current) return;
    if (step === 1 ? live.current.atEnd : live.current.atStart) { settle(); return; }
    // Falls back to a sensible width if the layout has not been measured yet;
    // the distance only decides how far off screen the card goes.
    const { out, from } = slidePlan(step, live.current.rtl, widthRef.current || 320);
    slidingRef.current = true;
    Animated.timing(slide, { toValue: out, duration: SLIDE_MS, useNativeDriver: false }).start(({ finished }) => {
      // Cut short (the screen went away mid-slide): drop the card back where it
      // belongs rather than paging on the strength of an animation that stopped.
      if (!finished) { slide.setValue(0); slidingRef.current = false; return; }
      go(step);
      slide.setValue(from);
      Animated.timing(slide, { toValue: 0, duration: SLIDE_MS, useNativeDriver: false })
        .start((end) => { if (!end.finished) slide.setValue(0); slidingRef.current = false; });
    });
  };

  useEffect(() => {
    live.current = {
      rtl,
      atStart: shownIndex === 0,
      atEnd: shownIndex === ids.length - 1,
      step: slideTo,
    };
  });

  const [pan] = useState(() => PanResponder.create(carouselPanConfig({
    locked: () => slidingRef.current,
    rtl: () => live.current.rtl,
    ends: () => ({ atStart: live.current.atStart, atEnd: live.current.atEnd }),
    onDrag: (x) => slide.setValue(x),
    onStep: (step) => live.current.step(step),
    onSettle: () => settle(),
  })));

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

  // Chevrons mirror with the reading direction: "previous" sits on the leading
  // edge (left in English, right in Hebrew) and points outward.
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;
  const chevron = (which: 'prev' | 'next') => {
    const off = which === 'prev' ? shownIndex === 0 : shownIndex === ids.length - 1;
    const Icon = which === 'prev' ? PrevIcon : NextIcon;
    return (
      <TouchableOpacity
        key={which}
        testID={`carousel-${which}`}
        onPress={() => slideTo(which === 'prev' ? -1 : 1)}
        disabled={off}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityState={{ disabled: off }}
        style={[styles.chevron, off && styles.chevronOff]}
      >
        <Icon size={18} color="#004aad" strokeWidth={2.2} />
      </TouchableOpacity>
    );
  };

  const renderRow = (c: PendingCandidate) => {
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
      <View key={c.proId} style={[styles.row, carousel && styles.rowCarousel]} testID={`candidate-row-${c.proId}`}>
        <View style={[styles.identity, { flexDirection: rowDir }]} testID={`candidate-identity-${c.proId}`}>
          {carousel && chevron('prev')}
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
            {c.proAccepted && resolved && (
              <AppText weight="semiBold" numberOfLines={1} style={[styles.acceptedTag, { textAlign: align }, dir]} testID={`candidate-pro-accepted-${c.proId}`}>
                {`✓ ${t('candidate_review.pro_accepted_tag', { name })}`}
              </AppText>
            )}
          </View>
          <AppText weight="bold" style={styles.price}>{money(c.total)}</AppText>
          {carousel && chevron('next')}
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
  };

  return (
    <View style={chromeStyles.strip} testID="candidate-review-card">
      <AppText weight="semiBold" style={[styles.title, { textAlign: align }]}>{t('candidate_review.title')}</AppText>
      <AppText weight="regular" style={[styles.instruction, { textAlign: align }]} testID="candidate-instruction">
        {t('candidate_review.client_instruction')}
      </AppText>
      {carousel ? (
        <View
          {...pan.panHandlers}
          testID="candidate-carousel"
          style={styles.carousel}
          onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; }}
        >
          {/* The row slides; the dots stay put — they are the position, not the card. */}
          <Animated.View testID="carousel-slider" style={{ transform: [{ translateX: slide }] }}>
            {renderRow(candidates[shownIndex])}
          </Animated.View>
          <View
            style={[styles.dots, { flexDirection: rowDir }]}
            testID="carousel-dots"
            accessibilityLabel={`${shownIndex + 1}/${candidates.length}`}
          >
            {candidates.map((c, i) => (
              <View key={c.proId} testID={`carousel-dot-${i}`} style={[styles.dot, i === shownIndex && styles.dotCurrent]} />
            ))}
          </View>
        </View>
      ) : renderRow(candidates[0])}

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

const styles = StyleSheet.create({
  title: { fontSize: 12, color: 'rgba(15,15,31,0.5)', marginBottom: 2 },
  instruction: { fontSize: 12, color: 'rgba(15,15,31,0.45)', marginBottom: 4 },
  // Clips the card that is leaving and the one arriving, so neither shows
  // outside the pinned strip mid-slide.
  carousel: { overflow: 'hidden' },
  row: { paddingVertical: 8, gap: 6 },
  // Carousel: the dots line (DOT + DOTS_MARGIN) is paid for by trimming the
  // row's vertical padding by the same amount, so the card is no taller than a
  // single-professional card. Asserted in CandidateReviewCard.test.tsx.
  rowCarousel: { paddingVertical: 3 },
  chevron: { width: 22, alignItems: 'center', justifyContent: 'center' },
  chevronOff: { opacity: 0.25 },
  dots: { justifyContent: 'center', alignItems: 'center', gap: 5, height: 6, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(0,74,173,0.2)' },
  dotCurrent: { backgroundColor: '#004aad' },
  identity: { alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: '#004aad22', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#004aad', fontSize: 15 },
  identityText: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, color: '#0f0f1f' },
  namePlaceholder: { color: 'rgba(15,15,31,0.35)' },
  roles: { fontSize: 12, color: 'rgba(15,15,31,0.55)' },
  acceptedTag: { fontSize: 11, color: '#1c7a4a' },
  price: { fontSize: 15, color: '#004aad' },
  status: { fontSize: 12, color: 'rgba(15,15,31,0.55)' },
  statusAction: { fontSize: 12, color: '#004aad' },
  actions: { gap: 8 },
});

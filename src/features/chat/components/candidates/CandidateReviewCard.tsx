import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Platform, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
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
import { carouselPanConfig, pageSwipeGuard, resolveShownIndex, slidePlan, SLIDE_MS } from './carousel';

type Busy = 'confirm' | 'reject' | 'price';

/** The paging area never shrinks below the tallest member: identity (42 avatar,
 *  or name + role + the confirmed line) + a status line + the pager's padding.
 *  Without it the buttons move under the reader's thumb as they page. */
const PAGER_MIN_HEIGHT = 92;

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
  onSwipeableChange,
}: {
  projectId: string;
  chatId: string;
  clientId: string;
  /**
   * Told whenever the card becomes swipeable (2+ professionals) or stops being
   * so. The screen uses it to stand its own swipe down — see ChatRoomScreen.
   */
  onSwipeableChange?: (swipeable: boolean) => void;
}) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
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
    screenWidth,
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
      screenWidth,
      step: slideTo,
    };
  });

  const [pan] = useState(() => PanResponder.create(carouselPanConfig({
    locked: () => slidingRef.current,
    rtl: () => live.current.rtl,
    ends: () => ({ atStart: live.current.atStart, atEnd: live.current.atEnd }),
    screenWidth: () => live.current.screenWidth,
    onDrag: (x) => slide.setValue(x),
    onStep: (step) => live.current.step(step),
    onSettle: () => settle(),
  })));

  // Paging the card and swiping the screen away are the same motion, and with
  // the app laid out left to right the screen's gesture starts in the same
  // place a right-swipe on the card does. Whoever owns the screen turns theirs
  // off while the card can be swiped.
  useEffect(() => {
    onSwipeableChange?.(carousel);
    return () => onSwipeableChange?.(false);
  }, [carousel, onSwipeableChange]);

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
    `/(client)/chat/project-details?projectId=${projectId}&chatId=${chatId}&section=payments` as never,
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
        // 26 + 9 either side = 44.
        hitSlop={9}
        accessibilityRole="button"
        accessibilityState={{ disabled: off }}
        style={[styles.chevron, off && styles.chevronOff]}
      >
        <Icon size={13} color="#8B8898" strokeWidth={2.2} />
      </TouchableOpacity>
    );
  };

  /** The part that pages: one professional, and whatever is true of them. */
  const renderMember = (c: PendingCandidate) => {
    const user = users[c.proId];
    // Unresolved (absent key) and unusable (null) both lock the row. Acting on a
    // professional whose name is not on screen is how the wrong one gets confirmed.
    const resolved: UserBasics | null = user ?? null;
    const name = resolved?.displayName ?? '';
    const pending = requests.filter((r) => r.status === 'pending' && r.professionalId === c.proId);
    // Waiting on the CLIENT outranks waiting on the pro: it is the one with an action.
    const waitingOnClient = pending.some((r) => r.fromUserId !== clientId);
    const waitingOnPro = !waitingOnClient && pending.length > 0;
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
              weight="bold"
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
              <View style={[styles.acceptedRow, { flexDirection: rowDir }]} testID={`candidate-pro-accepted-${c.proId}`}>
                <Check size={12} color="#2F7A45" strokeWidth={2.6} />
                <AppText weight="semiBold" numberOfLines={1} style={[styles.acceptedTag, { textAlign: align }, dir]}>
                  {t('candidate_review.pro_accepted_tag', { name })}
                </AppText>
              </View>
            )}
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
      </View>
    );
  };

  /** The three decisions, on whichever professional is shown. */
  const renderActions = (c: PendingCandidate) => {
    const resolved = users[c.proId] ?? null;
    const name = resolved?.displayName ?? '';
    const blocked = requests.some((r) => r.status === 'pending' && r.professionalId === c.proId);
    const rowBusy = busy[c.proId];
    const canAct = !!resolved && !rowBusy;
    return (
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
          testID={`candidate-price-${c.proId}`}
          label={t('candidate_review.change_price')}
          variant="outline"
          disabled={!canAct || blocked}
          loading={rowBusy === 'price'}
          onPress={() => setRepricing(c)}
        />
        <ActionButton
          testID={`candidate-not-relevant-${c.proId}`}
          label={t('candidate_review.not_relevant')}
          variant="danger"
          disabled={!canAct}
          loading={rowBusy === 'reject'}
          onPress={() => setRejecting(c)}
        />
      </View>
    );
  };

  const current = candidates[shownIndex] ?? candidates[0];

  return (
    <View style={chromeStyles.card} testID="candidate-review-card">
      {/* 1 — header: what this is, and where you are in the crew */}
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <AppText weight="bold" style={[styles.title, { textAlign: align }]}>{t('candidate_review.title')}</AppText>
        {carousel && (
          <AppText
            weight="semiBold"
            style={styles.counter}
            testID="carousel-counter"
            accessibilityLabel={`${shownIndex + 1}/${candidates.length}`}
          >
            {`${shownIndex + 1} / ${candidates.length}`}
          </AppText>
        )}
      </View>
      <View style={chromeStyles.divider} />

      {/* 2 — the crew member. The only part that pages: arrows on either side,
          the content itself sliding between them. Its minHeight is the tallest
          member's, so the buttons below never move while someone reaches for
          them. */}
      <View
        {...(carousel ? pan.panHandlers : {})}
        testID="candidate-pager"
        style={[styles.pager, { flexDirection: rowDir }, carousel ? pageSwipeGuard(Platform.OS) : null]}
        onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; }}
      >
        {carousel && chevron('prev')}
        <View style={styles.viewport}>
          <Animated.View testID="carousel-slider" style={{ transform: [{ translateX: slide }] }}>
            {renderMember(current)}
          </Animated.View>
        </View>
        {carousel && chevron('next')}
      </View>
      <View style={chromeStyles.divider} />

      {/* 3 — the decision, on the member above */}
      {renderActions(current)}
      <View style={chromeStyles.divider} />

      {/* 4 — read-once instructions, below the decision rather than above it */}
      <AppText weight="regular" style={[styles.instruction, { textAlign: align }]} testID="candidate-instruction">
        {t('candidate_review.client_instruction')}
      </AppText>

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
  // 1 — header
  header: { alignItems: 'center', paddingTop: 12, paddingHorizontal: 14, paddingBottom: 10 },
  title: { flex: 1, fontSize: 13.5, fontWeight: '700', color: '#1A1626' },
  counter: { fontSize: 11.5, fontWeight: '600', color: '#8B8898' },

  // 2 — the paging area. The viewport clips the card that is leaving and the
  // one arriving; the arrows sit outside it and stay put.
  pager: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, minHeight: PAGER_MIN_HEIGHT },
  viewport: { flex: 1, minWidth: 0, overflow: 'hidden' },
  chevron: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: '#F4F2FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronOff: { opacity: 0.35 },
  row: { gap: 6 },
  identity: { alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { backgroundColor: '#EDE4FB', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#6D28D9', fontSize: 17 },
  identityText: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 15, fontWeight: '700', color: '#1A1626' },
  namePlaceholder: { color: '#8B8898' },
  roles: { fontSize: 12, color: '#8B8898' },
  acceptedRow: { alignItems: 'center', gap: 3 },
  acceptedTag: { flexShrink: 1, fontSize: 11.5, fontWeight: '600', color: '#2F7A45' },
  price: { fontSize: 17, fontWeight: '800', color: '#4C1D95', letterSpacing: -0.2 },
  status: { fontSize: 11.5, color: '#8B8898' },
  statusAction: { fontSize: 11.5, fontWeight: '600', color: '#4C1D95' },

  // 3 — the decision. `stretch` is what keeps the three the same height when
  // one of them wraps to a second line.
  actions: { alignItems: 'stretch', gap: 8, paddingHorizontal: 14, paddingVertical: 11 },

  // 4 — instructions
  instruction: { fontSize: 11.5, lineHeight: 18, color: '#8B8898', paddingTop: 11, paddingHorizontal: 14, paddingBottom: 13 },
});

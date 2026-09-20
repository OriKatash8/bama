import { useEffect, useMemo, useRef, useState } from 'react';
import { View, TouchableOpacity, Modal, StyleSheet, ScrollView, ActivityIndicator, Dimensions, Animated } from 'react-native';
import { SlidersHorizontal, X, FolderPlus, Plus, Inbox, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRouter, useSegments } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { GradientBand } from '@components/ui/GradientBand';
import { AppText } from '@components/ui/AppText';
import { EmptyState } from '@components/ui/EmptyState';
import { useTheme } from '@core/hooks/useTheme';
import { ProjectRequestCard } from '@features/crew/components';
import { useProjectRequests } from '@features/crew/hooks';
import { PriceOfferCard } from '@features/offers/components/PriceOfferCard';
import { BundleOfferCard } from '@features/offers/components/BundleOfferCard';
import { usePriceOffers } from '@features/offers/hooks/usePriceOffers';
import { useBundleOffers } from '@features/offers/hooks/useBundleOffers';
import { useAcceptOffer } from '@features/offers/hooks/useAcceptOffer';
import { useAcceptBundleOffer } from '@features/offers/hooks/useAcceptBundleOffer';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { useOffersSeenStore, unseenOfferCount, newestOfferMs } from '@core/stores/offersSeenStore';
import { getDocument } from '@core/firebase/firestore';
import { confirmDialog } from '@utils/confirmDialog';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { PriceOffer, BundleOffer, ProjectRequest } from '@core/types/project';
import type { User, ProfessionalProfile } from '@core/types/user';
import { useTabBarClearance } from '@core/navigation/floatingTabBar';

/** `null` is the default: newest first. There is no separate 'date' member —
 *  date-descending IS the default order, so a chip for it would duplicate it. */
type OfferSort = 'price_asc' | 'price_desc' | 'stars' | null;
type ShowOnly = 'all' | 'bundle';
/** Which list the single vertical column is showing. Projects is always the
 *  default — deliberately NOT switched based on whether offers are pending. */
type Segment = 'projects' | 'offers';

type CombinedOffer =
  | { kind: 'bundle'; data: BundleOffer }
  | { kind: 'price'; data: PriceOffer };

type ProfessionalProfileSummary = { displayName: string; photoURL?: string; rating?: number };

const PAGE_BG = '#FAFAFC';
/** Buttons, outlines and icons on this page — client mode's purple. */
const VIOLET = '#6D28D9';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    let str = typeof result === 'string' ? result : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{{${k}}}`, v);
      }
    }
    return str;
  };
}

export default function ProjectsPage() {
  const colors = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];
  const { showToast } = useUiStore();
  const language = useSettingsStore((s) => s.language);
  const tabBarClearance = useTabBarClearance();
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const { requests, isLoading: requestsLoading } = useProjectRequests();
  const { offers, isLoading: offersLoading } = usePriceOffers();
  const { bundles, isLoading: bundlesLoading } = useBundleOffers();
  const { accept, reject, isAccepting } = useAcceptOffer();
  const { acceptBundle, rejectBundle, isAccepting: isBundleAccepting } = useAcceptBundleOffer();
  // Any hire in flight locks Accept on EVERY offer, not just the tapped one.
  // Two overlapping hires each create a group chat for the same project — one
  // professional with two offers here is what makes that easy to trigger.
  const anyHireInFlight = isAccepting !== null || isBundleAccepting !== null;

  const [professionalProfiles, setProfessionalProfiles] = useState<Record<string, ProfessionalProfileSummary>>({});
  const fetchedProfileIds = useRef<Set<string>>(new Set());

  const [projectTitles, setProjectTitles] = useState<Record<string, string>>({});
  const fetchedProjectIds = useRef<Set<string>>(new Set());
  const userId = useAuthStore((s) => s.user?.id);
  const [segment, setSegment] = useState<Segment>('projects');

  // Pop the newly-selected segment, as the chats tabs and MarketplaceToggle do.
  const segScales = useRef({
    projects: new Animated.Value(1),
    offers: new Animated.Value(1),
  }).current;
  useEffect(() => {
    const val = segScales[segment];
    val.setValue(0.9);
    Animated.spring(val, { toValue: 1, useNativeDriver: true, friction: 4, tension: 120 }).start();
  }, [segment, segScales]);

  const [offerSort, setOfferSort] = useState<OfferSort>(null);
  const [showOnly, setShowOnly] = useState<ShowOnly>('all');
  const [draftSort, setDraftSort] = useState<OfferSort>(null);
  const [draftShowOnly, setDraftShowOnly] = useState<ShowOnly>('all');
  const [sortModalVisible, setSortModalVisible] = useState(false);

  function openSortModal() { setDraftSort(offerSort); setDraftShowOnly(showOnly); setSortModalVisible(true); }
  function applySort() { setOfferSort(draftSort); setShowOnly(draftShowOnly); setSortModalVisible(false); }
  function clearSort() { setDraftSort(null); setDraftShowOnly('all'); setOfferSort(null); setShowOnly('all'); setSortModalVisible(false); }

  /**
   * Switching segments RESETS the filter rather than persisting it. The sort
   * control only renders in the Offers segment, so a filter left active while
   * its control is off-screen is invisible state the client cannot undo.
   */
  function switchSegment(next: Segment) {
    if (next === segment) return;
    setOfferSort(null);
    setShowOnly('all');
    setSegment(next);
  }

  useEffect(() => {
    const ids = new Set<string>();
    offers.forEach((o) => ids.add(o.professionalId));
    bundles.forEach((b) => ids.add(b.professionalId));

    const toFetch = Array.from(ids).filter((id) => !fetchedProfileIds.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => fetchedProfileIds.current.add(id));

    Promise.all(
      toFetch.map((id) =>
        Promise.all([
          getDocument<User>(`users/${id}`),
          getDocument<ProfessionalProfile>(`users/${id}/profile/data`),
        ]).then(([u, p]) => [id, u, p] as const)
      ),
    ).then((results) => {
      setProfessionalProfiles((prev) => {
        const next = { ...prev };
        for (const [id, u, p] of results) {
          if (u) next[id] = { displayName: u.displayName, photoURL: u.photoURL ?? undefined, rating: p?.rating };
        }
        return next;
      });
    });
  }, [offers, bundles]);

  useEffect(() => {
    const ids = new Set<string>();
    offers.forEach((o) => ids.add(o.projectId));
    // Bundles need their title too, now that the bundle card shows the project
    // band. Their children are usually in `offers` and would have pulled the
    // title incidentally — but that is a coincidence of the pending filter, not
    // a guarantee, and a bundle whose title was missing rendered an empty band.
    bundles.forEach((b) => ids.add(b.projectId));

    const toFetch = Array.from(ids).filter((id) => !fetchedProjectIds.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => fetchedProjectIds.current.add(id));

    Promise.all(
      toFetch.map((id) =>
        getDocument<Pick<ProjectRequest, 'title'>>(`projects/${id}`).then((p) => [id, p] as const),
      ),
    ).then((results) => {
      setProjectTitles((prev) => {
        const next = { ...prev };
        for (const [id, p] of results) {
          if (p) next[id] = p.title;
        }
        return next;
      });
    });
  }, [offers, bundles]);

  function goToProfessionalProfile(professionalId: string) {
    router.push(`/${modeSegment}/(tabs)/browse/profile/${professionalId}` as never);
  }

  /**
   * hireProfessional refuses for three distinct, actionable reasons, and a bare
   * catch collapsed all of them into "failed to accept" — the client was told
   * nothing about what to do next. The callable carries the reason in its
   * message; anything unrecognised keeps the generic text.
   *
   * This is a CLIENT screen, so §6 applies: slot occupancy and subscription state
   * belong to the professional and must not be disclosed here. Both refusals
   * collapse to one neutral line — the client's next step is the same either way
   * (pick somebody else), and the difference between them is not theirs to know.
   * `cannot-hire-yourself` stays distinct: it is about the client themselves.
   */
  function hireErrorMessage(err: unknown): string {
    const msg = String((err as { message?: string })?.message ?? '');
    if (msg.includes('cannot-hire-yourself')) return t('chats_page.hire_self_error');
    // `fee-arrears` collapses into the SAME neutral line as the slot cap, and
    // must stay that way: §6 forbids telling a client that a professional owes
    // BAMA money. The professional gets the detailed explanation in their own
    // app, where it is theirs to see.
    if (msg.includes('slot-cap-reached') || msg.includes('monthly-limit-reached')
      || msg.includes('fee-arrears')) {
      return t('chats_page.hire_unavailable_error');
    }
    // The project is the CLIENT's own, so naming the reason discloses nothing
    // about the professional — §6 governs the pro's slot and subscription state,
    // not the client's own project status.
    if (msg.includes('project-not-hireable')) return t('chats_page.hire_project_closed');
    if (msg.includes('offer-price-out-of-range')) return t('chats_page.hire_price_invalid');
    return t('chats_page.failed_accept');
  }

  /**
   * Accept hires and Deny discards, and both buttons sit side by side on every
   * offer card — so each asks first, naming who and how much, to catch a stray tap.
   */
  function confirmOffer(kind: 'accept' | 'reject', professionalId: string, price: number): Promise<boolean> {
    const vars = {
      name: professionalProfiles[professionalId]?.displayName ?? t('chats.unknown'),
      price: price.toLocaleString(),
    };
    return confirmDialog(
      t(`offers.confirm_${kind}_title`),
      t(`offers.confirm_${kind}_body`, vars),
      {
        confirm: t(kind === 'accept' ? 'offers.accept' : 'offers.deny'),
        cancel: t('common.cancel'),
        destructive: kind === 'reject',
      },
    );
  }

  async function handleAccept(offer: PriceOffer) {
    if (!(await confirmOffer('accept', offer.professionalId, offer.price))) return;
    try {
      await accept(offer);
      showToast(t('chats_page.offer_accepted'), 'success');
    } catch (err) {
      console.error('[hire] accept offer failed:', err);
      showToast(hireErrorMessage(err), 'error');
    }
  }

  async function handleReject(offer: PriceOffer) {
    if (!(await confirmOffer('reject', offer.professionalId, offer.price))) return;
    const offerId = offer.id;
    try {
      await reject(offerId);
    } catch {
      showToast(t('chats_page.failed_reject'), 'error');
    }
  }

  async function handleAcceptBundle(bundle: BundleOffer) {
    if (!(await confirmOffer('accept', bundle.professionalId, bundle.bundlePrice))) return;
    try {
      await acceptBundle(bundle);
      showToast(t('chats_page.offer_accepted'), 'success');
    } catch (err) {
      console.error('[hire] accept bundle failed:', err);
      showToast(hireErrorMessage(err), 'error');
    }
  }

  async function handleRejectBundle(bundle: BundleOffer) {
    if (!(await confirmOffer('reject', bundle.professionalId, bundle.bundlePrice))) return;
    const bundleId = bundle.id;
    try {
      await rejectBundle(bundleId);
    } catch {
      showToast(t('chats_page.failed_reject'), 'error');
    }
  }

  const combinedOffers = useMemo((): CombinedOffer[] => {
    const getPrice = (item: CombinedOffer) => item.kind === 'bundle' ? item.data.bundlePrice : item.data.price;
    const getRating = (item: CombinedOffer) => professionalProfiles[item.data.professionalId]?.rating ?? 0;
    const getDate = (item: CombinedOffer) => item.data.createdAt.seconds;

    const bundleItems: CombinedOffer[] = bundles.map((b) => ({ kind: 'bundle', data: b }));
    const priceItems: CombinedOffer[] = offers.map((o) => ({ kind: 'price', data: o }));

    const combined: CombinedOffer[] =
      showOnly === 'bundle' ? bundleItems : [...bundleItems, ...priceItems];

    if (offerSort === 'price_asc')  return [...combined].sort((a, b) => getPrice(a) - getPrice(b));
    if (offerSort === 'price_desc') return [...combined].sort((a, b) => getPrice(b) - getPrice(a));
    if (offerSort === 'stars')      return [...combined].sort((a, b) => getRating(b) - getRating(a));
    // Default (offerSort === null): newest first. Arrival order surfaced whichever
    // offer happened to be written first, which on a busy project buried the ones
    // the client had not seen yet.
    return [...combined].sort((a, b) => getDate(b) - getDate(a));
  }, [offers, bundles, offerSort, showOnly, professionalProfiles]);

  const filterActive = offerSort !== null || showOnly !== 'all';

  const SORT_OPTIONS: { value: OfferSort; label: string }[] = [
    { value: null,          label: t('offers.sort_none') },
    { value: 'price_asc',  label: t('offers.sort_price_low') },
    { value: 'price_desc', label: t('offers.sort_price_high') },
    { value: 'stars',      label: t('offers.sort_stars') },
  ];

  const SHOW_OPTIONS: { value: ShowOnly; label: string }[] = [
    { value: 'all',    label: t('offers.show_all') },
    { value: 'bundle', label: t('offers.show_bundle_only') },
  ];

  const activeRequests = requests.filter((r) => r.status !== 'completed' && r.status !== 'cancelled');

  /** Pending offers per project id, for the badge on each project card. Derived
   *  from the two lists this screen already subscribes to — no extra query. */
  const offerCountByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of offers) counts[o.projectId] = (counts[o.projectId] ?? 0) + 1;
    for (const b of bundles) counts[b.projectId] = (counts[b.projectId] ?? 0) + 1;
    return counts;
  }, [offers, bundles]);

  /**
   * Unseen offers: created after the last time this client OPENED the price offers
   * tab. Drives the purple circle on the "הצעות מחיר" pill and the new-offers strip,
   * counted exactly like the bottom Projects tab badge (shared helpers).
   */
  const lastSeenAt = useOffersSeenStore((s) => s.lastSeenAt);
  const markSeen = useOffersSeenStore((s) => s.markSeen);
  const allOffers = useMemo(() => [...offers, ...bundles], [offers, bundles]);
  const newOffersCount = userId ? unseenOfferCount(allOffers, lastSeenAt[userId] ?? 0) : 0;
  const newestMs = newestOfferMs(allOffers);

  // Being on the price offers tab is what "seen" means: opening it clears the circle
  // (and the bottom tab badge), and an offer that arrives while it's open is seen too.
  useEffect(() => {
    if (segment === 'offers' && userId && newestMs > 0) markSeen(userId, newestMs);
  }, [segment, userId, newestMs, markSeen]);

  return (
    <Screen scrollable={false} backgroundColor={PAGE_BG}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarClearance }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* The band holds only the segmented control — the tabs are the title.
            The row direction flips so the first segment sits on the leading edge. */}
        <GradientBand style={styles.band} flip>
        <View style={[styles.segBar, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          {(['projects', 'offers'] as const).map((key) => {
            const isActive = segment === key;
            return (
              <Animated.View key={key} style={[styles.segSlot, { transform: [{ scale: segScales[key] }] }]}>
                <TouchableOpacity
                  style={[styles.segPill, isActive && styles.segPillActive]}
                  onPress={() => switchSegment(key)}
                  activeOpacity={0.85}
                  // 34 + the track's 3 + 5 of slop = 44 on each side.
                  hitSlop={{ top: 5, bottom: 5 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <AppText
                    weight="semiBold"
                    style={[styles.segText, isActive ? styles.segTextActive : styles.segTextInactive]}
                    numberOfLines={1}
                  >
                    {key === 'projects' ? t('chats_page.my_projects') : t('chats_page.price_offers')}
                  </AppText>
                </TouchableOpacity>
                {/* Unseen offers, top-left of the pill, until the tab is opened. */}
                {key === 'offers' && newOffersCount > 0 && (
                  <View style={styles.offersBadge} pointerEvents="none" testID="offers-badge">
                    <AppText weight="bold" style={styles.offersBadgeText}>
                      {newOffersCount > 99 ? '99+' : String(newOffersCount)}
                    </AppText>
                  </View>
                )}
              </Animated.View>
            );
          })}
        </View>
        </GradientBand>

        <View style={styles.sheet}>
          {segment === 'projects' ? (
            <View style={styles.section}>
              {/* Awareness strip: the same unseen count as the pill's circle, gone
                  once the price offers tab has been opened. */}
              {newOffersCount > 0 && (
                <TouchableOpacity
                  style={[styles.newOffersStrip, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                  onPress={() => switchSegment('offers')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <AppText weight="semiBold" style={styles.newOffersText} numberOfLines={1}>
                    {t('chats_page.new_offers_strip', { n: String(newOffersCount) })}
                  </AppText>
                  {rtl
                    ? <ChevronLeft size={16} color="#6D28D9" strokeWidth={2.5} />
                    : <ChevronRight size={16} color="#6D28D9" strokeWidth={2.5} />}
                </TouchableOpacity>
              )}

              {requestsLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : activeRequests.length === 0 ? (
                <View style={{ minHeight: Dimensions.get('window').height * 0.6 }}>
                  <EmptyState
                    icon={FolderPlus}
                    title={t('chats_page.empty_projects_title')}
                    description={t('chats_page.empty_projects_desc')}
                    primaryAction={{
                      label: t('chats_page.empty_projects_primary'),
                      icon: Plus,
                      onPress: () => router.push('/(client)/(tabs)/home'),
                    }}
                    secondaryAction={{
                      label: t('chats_page.empty_projects_secondary'),
                      onPress: () => router.push('/(client)/(tabs)/browse'),
                    }}
                  />
                </View>
              ) : (
                activeRequests.map((item) => (
                  <ProjectRequestCard
                    key={item.id}
                    request={item}
                    offerCount={offerCountByProject[item.id] ?? 0}
                  />
                ))
              )}
            </View>
          ) : (
            <View style={styles.section}>
              {/* No heading — the active segment already says "price offers".
                  The filter lives here ONLY: switchSegment resets it, so it can
                  never stay active while its control is off-screen. */}
              {combinedOffers.length > 0 && (
                <View style={[styles.filterRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <TouchableOpacity
                    style={[styles.sortBtn, filterActive && styles.sortBtnActive]}
                    onPress={openSortModal}
                    activeOpacity={0.8}
                    // 32 visual + 6 either side = 44.
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <SlidersHorizontal size={14} color="#000000" strokeWidth={2} />
                    <AppText weight="semiBold" style={styles.sortBtnText}>
                      {t('offers.filter')}
                    </AppText>
                  </TouchableOpacity>
                </View>
              )}

              {(offersLoading || bundlesLoading) ? (
                <ActivityIndicator color={colors.accent} />
              ) : combinedOffers.length === 0 ? (
                <View style={{ minHeight: Dimensions.get('window').height * 0.5 }}>
                  <EmptyState
                    icon={Inbox}
                    title={t('chats_page.empty_offers_title')}
                    description={t('chats_page.empty_offers_desc')}
                    primaryAction={{
                      label: t('chats_page.empty_offers_primary'),
                      onPress: () => switchSegment('projects'),
                    }}
                    secondaryAction={{
                      label: t('chats_page.empty_projects_secondary'),
                      onPress: () => router.push('/(client)/(tabs)/browse'),
                    }}
                  />
                </View>
              ) : (
                combinedOffers.map((item) =>
                  item.kind === 'bundle' ? (
                    <BundleOfferCard
                      key={`bundle-${item.data.id}`}
                      bundle={item.data}
                      professionalProfile={professionalProfiles[item.data.professionalId]}
                      projectTitle={projectTitles[item.data.projectId]}
                      onPressProfile={() => goToProfessionalProfile(item.data.professionalId)}
                      onAccept={() => handleAcceptBundle(item.data)}
                      onReject={() => handleRejectBundle(item.data)}
                      isAccepting={isBundleAccepting === item.data.id}
                      busy={anyHireInFlight}
                    />
                  ) : (
                    <PriceOfferCard
                      key={`price-${item.data.id}`}
                      offer={item.data}
                      professionalProfile={professionalProfiles[item.data.professionalId]}
                      projectTitle={projectTitles[item.data.projectId]}
                      onPressProfile={() => goToProfessionalProfile(item.data.professionalId)}
                      onAccept={() => handleAccept(item.data)}
                      onReject={() => handleReject(item.data)}
                      isAccepting={isAccepting === item.data.id}
                      busy={anyHireInFlight}
                    />
                  )
                )
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sort modal */}
      <Modal visible={sortModalVisible} transparent animationType="fade" onRequestClose={() => setSortModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setSortModalVisible(false)} />
          <View style={styles.modalCard}>
            <View style={[styles.modalHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <AppText weight="bold" style={[styles.modalTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('offers.filter')}
              </AppText>
              <TouchableOpacity onPress={() => setSortModalVisible(false)} style={styles.modalClose} activeOpacity={0.7}>
                <X size={20} color={VIOLET} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              <AppText weight="semiBold" style={[styles.modalSectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('offers.sort_title')}
              </AppText>
              <View style={[styles.sortOptions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                {SORT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[styles.sortOption, draftSort === opt.value && styles.sortOptionActive]}
                    onPress={() => setDraftSort(opt.value)}
                    activeOpacity={0.8}
                  >
                    <AppText weight="semiBold" style={[styles.sortOptionText, draftSort === opt.value && styles.sortOptionTextActive]}>
                      {opt.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
              <AppText weight="semiBold" style={[styles.modalSectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('offers.show_label')}
              </AppText>
              <View style={[styles.showOptions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                {SHOW_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.sortOption, styles.showOption, draftShowOnly === opt.value && styles.sortOptionActive]}
                    onPress={() => setDraftShowOnly(opt.value)}
                    activeOpacity={0.8}
                  >
                    <AppText weight="semiBold" style={[styles.sortOptionText, draftShowOnly === opt.value && styles.sortOptionTextActive]}>
                      {opt.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={[styles.modalActions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity style={styles.clearBtn} onPress={clearSort} activeOpacity={0.7}>
                <AppText weight="semiBold" style={styles.clearBtnText}>{t('offers.clear')}</AppText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applySort} activeOpacity={0.85}>
                <AppText weight="bold" style={styles.applyBtnText}>{t('offers.apply')}</AppText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {},
  band: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 40 },
  /** Overlaps the band's bottom edge; zIndex so it paints over the gradient. */
  sheet: {
    flexGrow: 1,
    backgroundColor: PAGE_BG,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginTop: -22,
    zIndex: 1,
    paddingTop: 18,
    paddingHorizontal: 20,
    gap: 20,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -6 },
    elevation: 6,
  },
  section: { gap: 10 },
  // The filter is alone on its row now that the heading is gone. flex-end puts
  // it on the TRAILING edge in both directions — left under row-reverse, right
  // under row — which is where it sat when the heading held the leading edge.
  filterRow: { alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 },
  // ── Segmented control ── one translucent track on the band, white thumb.
  segBar: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    padding: 3,
  },
  segSlot: { flex: 1 },
  segPill: {
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  segPillActive: { backgroundColor: '#FFFFFF' },
  segText: { fontSize: 13.5, fontWeight: '600' },
  segTextActive: { color: '#4C1D95' },
  segTextInactive: { color: 'rgba(255,255,255,0.85)' },
  // Unseen-offers count on the top-left of the price offers segment: a white
  // circle with violet digits, so it reads against the violet band.
  offersBadge: {
    position: 'absolute',
    top: -7,
    left: -7,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    // No border: white on white would vanish. A soft shadow lifts it off the
    // translucent track instead. It only ever shows while the offers segment is
    // NOT selected (opening it marks everything seen), so it never sits on the
    // white thumb.
    shadowColor: '#4C1D95',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  offersBadgeText: { color: '#6D28D9', fontSize: 11, lineHeight: 14 },

  // ── New-offers strip ──
  newOffersStrip: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F3EEFE',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 2,
  },
  newOffersText: { fontSize: 13, color: '#4C1D95', flexShrink: 1 },

  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    borderRadius: 999,
    paddingHorizontal: 13,
    backgroundColor: '#F3EEFE',
    borderWidth: 1,
    borderColor: '#6D28D9',
  },
  // A filter is on: the outline thickens against the same purple fill.
  sortBtnActive: { borderWidth: 1.5 },
  sortBtnText: { fontSize: 12.5, fontWeight: '600', color: '#000000' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: {
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
  modalHeader: { alignItems: 'center', marginBottom: 12 },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#000000' },
  modalClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  modalScroll: { flexShrink: 1, marginBottom: 4 },
  modalSectionLabel: { fontSize: 12, color: '#000000', marginBottom: 8, marginTop: 10 },
  sortOptions: { flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  showOptions: { flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  showOption: {},
  sortOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(109,40,217,0.25)', backgroundColor: '#fff' },
  sortOptionActive: { backgroundColor: VIOLET, borderColor: VIOLET },
  sortOptionText: { fontSize: 13, color: VIOLET },
  sortOptionTextActive: { color: '#fff' },
  modalActions: { alignItems: 'center', gap: 12, marginTop: 18 },
  // The pair splits the row 70 / 30 (flexBasis 0, so the grow values are the
  // ratio itself): apply is the filled primary, clear its outlined companion.
  clearBtn: { flex: 3, borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(109,40,217,0.25)' },
  clearBtnText: { color: VIOLET, fontSize: 14 },
  applyBtn: { flex: 7, borderRadius: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: VIOLET },
  applyBtnText: { color: '#fff', fontSize: 15 },
});

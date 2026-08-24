import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useSegments } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { PageTitle } from '@components/ui/PageTitle';
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
import { useAppFont } from '@core/hooks/useAppFont';
import { getDocument } from '@core/firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { PriceOffer, BundleOffer, ProjectRequest } from '@core/types/project';
import type { User, ProfessionalProfile } from '@core/types/user';

const CARD_W = Dimensions.get('window').width - 104;
const CARD_GAP = 40;

type OfferSort = 'price_asc' | 'price_desc' | 'stars' | 'date' | null;
type ShowOnly = 'all' | 'bundle';

type CombinedOffer =
  | { kind: 'bundle'; data: BundleOffer }
  | { kind: 'price'; data: PriceOffer };

type ProfessionalProfileSummary = { displayName: string; photoURL?: string; rating?: number };

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
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();

  const { requests, isLoading: requestsLoading } = useProjectRequests();
  const { offers, isLoading: offersLoading } = usePriceOffers();
  const { bundles, isLoading: bundlesLoading } = useBundleOffers();
  const { accept, reject, isAccepting } = useAcceptOffer();
  const { acceptBundle, rejectBundle, isAccepting: isBundleAccepting } = useAcceptBundleOffer();

  const [professionalProfiles, setProfessionalProfiles] = useState<Record<string, ProfessionalProfileSummary>>({});
  const fetchedProfileIds = useRef<Set<string>>(new Set());

  const [projectTitles, setProjectTitles] = useState<Record<string, string>>({});
  const fetchedProjectIds = useRef<Set<string>>(new Set());
  const [projectIndex, setProjectIndex] = useState(0);
  const projectScrollRef = useRef<ScrollView>(null);

  const [offerSort, setOfferSort] = useState<OfferSort>(null);
  const [showOnly, setShowOnly] = useState<ShowOnly>('all');
  const [draftSort, setDraftSort] = useState<OfferSort>(null);
  const [draftShowOnly, setDraftShowOnly] = useState<ShowOnly>('all');
  const [sortModalVisible, setSortModalVisible] = useState(false);

  function openSortModal() { setDraftSort(offerSort); setDraftShowOnly(showOnly); setSortModalVisible(true); }
  function applySort() { setOfferSort(draftSort); setShowOnly(draftShowOnly); setSortModalVisible(false); }
  function clearSort() { setDraftSort(null); setDraftShowOnly('all'); setOfferSort(null); setShowOnly('all'); setSortModalVisible(false); }

  function scrollToProject(index: number) {
    projectScrollRef.current?.scrollTo({ x: index * (CARD_W + CARD_GAP), animated: true });
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
  }, [offers]);

  function goToProfessionalProfile(professionalId: string) {
    router.push(`/${modeSegment}/(tabs)/browse/profile/${professionalId}` as never);
  }

  async function handleAccept(offer: PriceOffer) {
    try {
      await accept(offer);
      showToast(t('chats_page.offer_accepted'), 'success');
    } catch {
      showToast(t('chats_page.failed_accept'), 'error');
    }
  }

  async function handleReject(offerId: string) {
    try {
      await reject(offerId);
    } catch {
      showToast(t('chats_page.failed_reject'), 'error');
    }
  }

  async function handleAcceptBundle(bundle: BundleOffer) {
    try {
      await acceptBundle(bundle);
      showToast(t('chats_page.offer_accepted'), 'success');
    } catch {
      showToast(t('chats_page.failed_accept'), 'error');
    }
  }

  async function handleRejectBundle(bundleId: string) {
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

    let combined: CombinedOffer[];
    if (showOnly === 'bundle') {
      combined = bundleItems;
    } else if (!offerSort) {
      // Default: bundles first, then price offers, each in arrival order
      combined = [...bundleItems, ...priceItems];
    } else {
      combined = [...bundleItems, ...priceItems];
    }

    if (offerSort === 'price_asc')  return [...combined].sort((a, b) => getPrice(a) - getPrice(b));
    if (offerSort === 'price_desc') return [...combined].sort((a, b) => getPrice(b) - getPrice(a));
    if (offerSort === 'stars')      return [...combined].sort((a, b) => getRating(b) - getRating(a));
    if (offerSort === 'date')       return [...combined].sort((a, b) => getDate(b) - getDate(a));
    return combined;
  }, [offers, bundles, offerSort, showOnly, professionalProfiles]);

  const filterActive = offerSort !== null || showOnly !== 'all';

  const SORT_OPTIONS: { value: OfferSort; label: string }[] = [
    { value: null,          label: t('offers.sort_none') },
    { value: 'price_asc',  label: t('offers.sort_price_low') },
    { value: 'price_desc', label: t('offers.sort_price_high') },
    { value: 'stars',      label: t('offers.sort_stars') },
    { value: 'date',       label: t('offers.sort_date') },
  ];

  const SHOW_OPTIONS: { value: ShowOnly; label: string }[] = [
    { value: 'all',    label: t('offers.show_all') },
    { value: 'bundle', label: t('offers.show_bundle_only') },
  ];

  return (
    <Screen scrollable={false}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PageTitle>{t('chats_page.my_projects')}</PageTitle>

        <View style={styles.content}>
          {(() => {
            const active = requests.filter((r) => r.status !== 'completed');
            return (
              <View style={styles.section}>
                {!requestsLoading && active.length > 0 && (
                  <View style={[styles.projectTitleRow, { flexDirection: rtl ? 'row-reverse' : 'row', justifyContent: 'flex-end' }]}>
                    <Text style={[styles.projectCounter, { ...font.regular }]}>
                      {projectIndex + 1}/{active.length}
                    </Text>
                  </View>
                )}
                {requestsLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : active.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Text style={[styles.emptyText, { color: colors.textMuted, ...font.regular, textAlign: rtl ? 'right' : 'left' }]}>
                      {t('chats_page.no_projects')}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.carouselWrap}>
                    <ScrollView
                      ref={projectScrollRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.projectsScroll}
                      snapToInterval={CARD_W + CARD_GAP}
                      decelerationRate="fast"
                      scrollEventThrottle={16}
                      onScroll={(e) => {
                        const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + CARD_GAP));
                        setProjectIndex(Math.max(0, Math.min(idx, active.length - 1)));
                      }}
                    >
                      {active.map((item) => (
                        <View key={item.id} style={{ width: CARD_W }}>
                          <ProjectRequestCard request={item} />
                        </View>
                      ))}
                    </ScrollView>
                    {projectIndex > 0 && (
                      <TouchableOpacity
                        style={[styles.arrowBtn, { left: 0 }]}
                        onPress={() => scrollToProject(projectIndex - 1)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.arrowCircle}>
                          <ChevronLeft size={18} color="#004aad" strokeWidth={2.5} />
                        </View>
                      </TouchableOpacity>
                    )}
                    {projectIndex < active.length - 1 && (
                      <TouchableOpacity
                        style={[styles.arrowBtn, { right: 0 }]}
                        onPress={() => scrollToProject(projectIndex + 1)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.arrowCircle}>
                          <ChevronRight size={18} color="#004aad" strokeWidth={2.5} />
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })()}

          {(offers.length > 0 || bundles.length > 0) && (
            <View style={[styles.section, { marginTop: 24 }]}>
              <View style={[styles.sectionTitleRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <Text style={[styles.sectionTitle, { color: '#004aad', ...font.bold }]}>
                  {t('chats_page.price_offers')}
                </Text>
                <TouchableOpacity
                  style={[styles.sortBtn, filterActive && styles.sortBtnActive]}
                  onPress={openSortModal}
                  activeOpacity={0.8}
                >
                  <SlidersHorizontal size={14} color='#1e4fa3' strokeWidth={2} />
                  <AppText weight="semiBold" style={styles.sortBtnText}>
                    {t('offers.filter')}
                  </AppText>
                </TouchableOpacity>
              </View>
              {(offersLoading || bundlesLoading) ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                combinedOffers.map((item) =>
                  item.kind === 'bundle' ? (
                    <BundleOfferCard
                      key={`bundle-${item.data.id}`}
                      bundle={item.data}
                      professionalProfile={professionalProfiles[item.data.professionalId]}
                      onPressProfile={() => goToProfessionalProfile(item.data.professionalId)}
                      onAccept={() => handleAcceptBundle(item.data)}
                      onReject={() => handleRejectBundle(item.data.id)}
                      isAccepting={isBundleAccepting === item.data.id}
                    />
                  ) : (
                    <PriceOfferCard
                      key={`price-${item.data.id}`}
                      offer={item.data}
                      professionalProfile={professionalProfiles[item.data.professionalId]}
                      projectTitle={projectTitles[item.data.projectId]}
                      onPressProfile={() => goToProfessionalProfile(item.data.professionalId)}
                      onAccept={() => handleAccept(item.data)}
                      onReject={() => handleReject(item.data.id)}
                      isAccepting={isAccepting === item.data.id}
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
          <LinearGradient colors={['#efd4f6', '#b7cae6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalCard}>
            <View style={[styles.modalHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <AppText weight="bold" style={[styles.modalTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('offers.filter')}
              </AppText>
              <TouchableOpacity onPress={() => setSortModalVisible(false)} style={styles.modalClose} activeOpacity={0.7}>
                <X size={20} color="#004aad" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              <AppText weight="bold" style={[styles.modalSectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('offers.sort_title')}
              </AppText>
              <View style={styles.sortOptions}>
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
              <AppText weight="bold" style={[styles.modalSectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('offers.show_label')}
              </AppText>
              <View style={styles.showOptions}>
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
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.clearBtn} onPress={clearSort} activeOpacity={0.8}>
                <AppText weight="bold" style={styles.clearBtnText}>{t('offers.clear')}</AppText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applySort} activeOpacity={0.8}>
                <AppText weight="bold" style={styles.applyBtnText}>{t('offers.apply')}</AppText>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  projectsScroll: { paddingHorizontal: 36, paddingVertical: 4, gap: CARD_GAP },
  headerWrap: {
    alignSelf: 'stretch',
    marginHorizontal: -16,
    marginTop: -16,
  },
  content: { padding: 16, gap: 20 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '800' },
  sectionTitleRow: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  projectTitleRow: { alignItems: 'center', justifyContent: 'flex-start', gap: 8, marginBottom: 8 },
  projectCounter: { fontSize: 13, color: '#8890b0' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15 },
  carouselWrap: { position: 'relative' },
  arrowBtn: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    zIndex: 10,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,74,173,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: 'rgba(30,79,163,0.10)',
  },
  sortBtnActive: { backgroundColor: 'rgba(30,79,163,0.22)' },
  sortBtnText: { fontSize: 13, color: '#1e4fa3' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { width: '88%', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 20 },
  modalHeader: { alignItems: 'center', marginBottom: 20 },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#004aad' },
  modalClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  modalScroll: { flexShrink: 1, marginBottom: 4 },
  modalSectionLabel: { fontSize: 13, fontWeight: '700', color: '#004aad', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
  sortOptions: { gap: 8, marginBottom: 16 },
  showOptions: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  showOption: { flex: 1 },
  sortOption: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,74,173,0.15)', backgroundColor: '#fff' },
  sortOptionActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  sortOptionText: { fontSize: 14, color: 'rgba(0,0,0,0.55)' },
  sortOptionTextActive: { color: '#fff' },
  modalActions: { flexDirection: 'row', gap: 10 },
  clearBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1.5, borderColor: '#004aad' },
  clearBtnText: { color: '#004aad', fontSize: 15 },
  applyBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#004aad' },
  applyBtnText: { color: '#fff', fontSize: 15 },
});

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { rtlSafe } from '@utils/formatters';
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Text, TextInput } from '@components/ui/Text';
import { AppText } from '@components/ui/AppText';
import { tabSwipeLockProps } from '@core/navigation/pagerSwipeLock';
import { SlidersHorizontal, X, Search, Plus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@components/layout/Screen';
import { GradientBand } from '@components/ui/GradientBand';
import { MarketplaceToggle } from '@features/marketplace/components/MarketplaceToggle';
import { ListingCard } from '@features/marketplace/components/ListingCard';
import { ListingDetailModal } from '@features/marketplace/components/ListingDetailModal';
import { PostListingSheet } from '@features/marketplace/components/PostListingSheet';
import { CategoryTile } from '@features/marketplace/components/CategoryTile';
import { MARKET_CATEGORIES } from '@features/marketplace/data/categories';
import { useMarketplaceListings } from '@features/marketplace/hooks/useMarketplaceListings';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getDocument } from '@core/firebase/firestore';
import { useUiStore } from '@core/stores/uiStore';
import { useAuthStore } from '@core/stores/authStore';
import { useDemoStore } from '@core/stores/demoStore';
import { hidesRentals } from '@core/demo/demoSides';
import { useBamaMail } from '@core/contact/useBamaMail';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { MarketplaceListing, MarketplaceListingType, ProductCondition } from '@features/marketplace/types';
import { brandLabel, emptyCase, sortByPrice } from '@features/marketplace/utils';
import { AnimatedEmptyState } from '@components/empty-state/AnimatedEmptyState';
import { useTabBarHeight, TAB_BAR_CONTENT_GAP, FAB_SIZE, useModeAccent } from '@core/navigation/floatingTabBar';
import { shadow } from '@core/theme/shadow';
import { useRentalItems } from '@features/rentals/hooks/useRentalItems';
import { usePartnerCompanies } from '@features/rentals/hooks/usePartnerCompanies';
import { rentalItemToListing } from '@features/rentals/listing';
import { PartnerRow } from '@features/rentals/components/PartnerRow';
import { CompanyFilterChips } from '@features/rentals/components/CompanyFilterChips';

type Translations = typeof en;

const PAGE_BG = '#FAFAFC';
/** Text. */
const TEXT = '#000000';
/** Buttons (and their outlines and icons). */
const BLUE = '#1D4ED8';
/** Chrome draws `outline: auto` over the focus border; RN's types have no 'none'. */
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

const CATEGORIES = MARKET_CATEGORIES;

const BRANDS_BY_CATEGORY: Record<string, string[]> = {
  all:         ['Sony', 'Canon', 'Nikon', 'DJI', 'Godox', 'Sennheiser', 'Manfrotto', 'Other'],
  camera:      ['Sony', 'Canon', 'Blackmagic', 'RED', 'ARRI', 'Panasonic', 'Nikon', 'Fujifilm', 'Leica', 'GoPro', 'Insta360', 'Other'],
  lens:        ['Canon', 'Nikon', 'Sony', 'Sigma', 'Tamron', 'Zeiss', 'Cooke', 'Leica', 'Samyang', 'Tokina', 'Other'],
  audio:       ['Sennheiser', 'Rode', 'Shure', 'Audio-Technica', 'Sony', 'Zoom', 'Tascam', 'Sound Devices', 'DPA', 'Neumann', 'Other'],
  lighting:    ['Aputure', 'Nanlite', 'Godox', 'Profoto', 'Broncolor', 'Arri', 'Kino Flo', 'Litepanels', 'Elinchrom', 'Other'],
  drone:       ['DJI', 'Autel', 'Parrot', 'Skydio', 'IFlight', 'Geprc', 'Other'],
  studio:      ['Manfrotto', 'Gitzo', 'DJI', 'Zhiyun', 'SmallHD', 'Atomos', 'Matthews', 'Sachtler', 'Other'],
  accessories: ['Sony', 'Canon', 'Nikon', 'DJI', 'Godox', 'Sennheiser', 'Manfrotto', 'Other'],
};

const CONDITIONS: { value: ProductCondition }[] = [
  { value: 'new' },
  { value: 'like_new' },
  { value: 'good' },
  { value: 'fair' },
];

type FilterTag = { key: string; label: string; onRemove: () => void };

export default function MarketplaceScreen() {
  const [activeTab, setActiveTab]               = useState<MarketplaceListingType>('secondhand');
  // New rentals are paused for now — no + on the rental tab.
  const canPost = activeTab !== 'rental';
  const [searchQuery, setSearchQuery]           = useState('');
  /** Visual only: the search field's focus border. */
  const [searchFocused, setSearchFocused]       = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedListing, setSelectedListing]   = useState<MarketplaceListing | null>(null);
  const [editListing, setEditListing]           = useState<MarketplaceListing | null>(null);
  const [postSheetVisible, setPostSheetVisible] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Applied filters
  const [priceSort, setPriceSort]             = useState<'asc' | 'desc' | null>(null);
  const [filterBrands, setFilterBrands]       = useState<string[]>([]);
  const [filterCondition, setFilterCondition] = useState<ProductCondition | null>(null);

  // Draft filters (inside modal, not yet applied)
  const [draftPriceSort, setDraftPriceSort]     = useState<'asc' | 'desc' | null>(null);
  const [draftBrands, setDraftBrands]           = useState<string[]>([]);
  const [draftCondition, setDraftCondition]     = useState<ProductCondition | null>(null);
  /** Rental tab: the popup's "Rental company" choice, applied to `partnerId`. */
  const [draftPartnerId, setDraftPartnerId]     = useState<string | null>(null);

  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  // The search magnifier takes the mode colour: purple client, blue pro.
  const { accent: searchIconColor } = useModeAccent();
  const tabBarHeight = useTabBarHeight();
  /** Whether the empty state fits the screen (it reports once measured); the page locks only then. */
  const [emptyFits, setEmptyFits] = useState(true);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const { listings: fetched, isLoading } = useMarketplaceListings(activeTab);
  // Rentals launch as "coming soon": App Review's demo accounts see the same empty rental tab as
  // real users (the seeded demo rental stays in the data; only this screen hides it).
  const me = useAuthStore((s) => s.user?.id);
  const demoConfig = useDemoStore((s) => s.config);
  const listings = useMemo(
    () => (activeTab === 'rental' && hidesRentals(demoConfig, me) ? [] : fetched),
    [activeTab, demoConfig, me, fetched],
  );
  const rentalMail = useBamaMail(t('marketplace.rental_apply_subject'), t('mail_cta.failed'));

  // Rental companies' synced items (src/features/rentals): paged from the server
  // with the tab's category, partner, search, brand and price order, and merged
  // with the admin's own rentals. Demo accounts see none, like every rental.
  const isRentalTab = activeTab === 'rental';
  const companyRentalsOn = isRentalTab && !hidesRentals(demoConfig, me);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const { companies: partners } = usePartnerCompanies(companyRentalsOn);
  const companyItems = useRentalItems({
    category: selectedCategory === 'all' ? null : selectedCategory,
    companyId: partnerId,
    sort: priceSort === 'asc' ? 'price_asc' : priceSort === 'desc' ? 'price_desc' : 'name',
    search: searchQuery,
    brands: filterBrands,
    enabled: companyRentalsOn,
  });
  const companyListings = useMemo(() => companyItems.items.map(rentalItemToListing), [companyItems.items]);
  const partnerName = partners.find((c) => c.id === partnerId)?.name ?? '';

  // Deep-link: open a specific listing when arriving with ?listingId= (e.g. from a שוק card).
  const params = useLocalSearchParams<{ listingId?: string }>();
  const router = useRouter();
  const { showToast } = useUiStore();
  const handledListingRef = useRef<string | null>(null);
  useEffect(() => {
    const id = typeof params.listingId === 'string' ? params.listingId : '';
    if (!id || handledListingRef.current === id) return;
    handledListingRef.current = id;
    getDocument<MarketplaceListing>(`marketplace_listings/${id}`).then((data) => {
      if (data) setSelectedListing({ ...data, id });
      else showToast(t('marketplace.listing_unavailable'), 'error');
      router.setParams({ listingId: '' }); // clear so a later tab visit won't re-open
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.listingId]);

  // The admin's own listings on this tab, filtered here (company items arrive filtered by the server).
  const filteredOwn = useMemo(() => {
    const q = searchQuery.toLowerCase();
    let result = listings.filter((l) =>
      l.productName.toLowerCase().includes(q) ||
      (l.brand ?? '').toLowerCase().includes(q)
    );
    if (selectedCategory !== 'all') {
      result = result.filter((l) => l.category === selectedCategory);
    }
    if (filterBrands.length > 0) {
      result = result.filter((l) =>
        filterBrands.some((b) => l.brand?.toLowerCase() === b.toLowerCase())
      );
    }
    if (filterCondition) {
      result = result.filter((l) => l.condition === filterCondition);
    }
    if (priceSort === 'asc' || priceSort === 'desc') result = sortByPrice(result, priceSort);
    return result;
  }, [listings, searchQuery, selectedCategory, filterBrands, filterCondition, priceSort]);

  // Rental tab: own rentals (none while a partner is chosen) + the loaded company
  // items, in one price order when one is set — "price on request" always last.
  const filtered = useMemo(() => {
    if (!isRentalTab) return filteredOwn;
    const merged = [...(partnerId ? [] : filteredOwn), ...companyListings];
    if (priceSort !== 'asc' && priceSort !== 'desc') return merged;
    const priced = merged.filter((l) => !l.priceOnRequest);
    return [...sortByPrice(priced, priceSort), ...merged.filter((l) => l.priceOnRequest)];
  }, [isRentalTab, filteredOwn, partnerId, companyListings, priceSort]);

  /** Near the end of the page, the next page of company items. */
  function onPageScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 600) companyItems.loadMore();
  }

  // Which empty state, if any: nothing listed on this tab, or nothing matching.
  // A partner with visible items means the tab has rentals, so a search that
  // finds nothing is 'filtered', not the "coming soon" state.
  const partnerItems = isRentalTab ? partners.reduce((n, c) => n + (c.visibleCount ?? 0), 0) : 0;
  const gridLoading = isLoading || (companyRentalsOn && companyItems.loading && filtered.length === 0);
  const empty = emptyCase({ tab: activeTab, isLoading: gridLoading, total: listings.length + partnerItems, shown: filtered.length });
  const locked = !!empty && emptyFits;

  const filtersActive = priceSort !== null || filterBrands.length > 0 || !!filterCondition || !!partnerId;

  const activeFilterTags: FilterTag[] = [
    ...(partnerId ? [{
      key: 'partner',
      label: t('rentals.partner_filter').replace('{{name}}', partnerName),
      onRemove: () => setPartnerId(null),
    }] : []),
    ...(priceSort ? [{
      key: 'price',
      label: priceSort === 'asc' ? t('marketplace.filter_price_low') : t('marketplace.filter_price_high'),
      onRemove: () => setPriceSort(null),
    }] : []),
    ...(filterBrands.length > 0 ? [{
      key: 'brand',
      label: `${t('marketplace.filter_brand')}: ${filterBrands.map((b) => brandLabel(b, rtl ? 'he' : 'en')).join(', ')}`,
      onRemove: () => setFilterBrands([]),
    }] : []),
...(filterCondition ? [{
      key: 'condition',
      label: `${t('marketplace.filter_condition')}: ${t(`marketplace.condition_${filterCondition}`)}`,
      onRemove: () => setFilterCondition(null),
    }] : []),
  ];

  const availableBrands = BRANDS_BY_CATEGORY[selectedCategory] ?? BRANDS_BY_CATEGORY['all'];
  const selectedCatLabelKey = CATEGORIES.find((c) => c.id === selectedCategory)?.labelKey;

  function openFilterModal() {
    setDraftPriceSort(priceSort);
    setDraftBrands(filterBrands);
    setDraftCondition(filterCondition);
    setDraftPartnerId(partnerId);
    setFilterModalVisible(true);
  }

  function applyFilters() {
    setPriceSort(draftPriceSort);
    setFilterBrands(draftBrands);
    setFilterCondition(draftCondition);
    setPartnerId(draftPartnerId);
    setFilterModalVisible(false);
  }

  function clearFilters() {
    setDraftPriceSort(null);
    setDraftBrands([]);
    setDraftCondition(null);
    setDraftPartnerId(null);
    setPriceSort(null);
    setFilterBrands([]);
    setFilterCondition(null);
    setPartnerId(null);
    setFilterModalVisible(false);
  }

  /** The empty state's "clear": search text, category and every filter. */
  function clearSearchAndFilters() {
    setSearchQuery('');
    setSelectedCategory('all');
    setPartnerId(null);
    clearFilters();
  }

  function toggleDraftBrand(brand: string) {
    setDraftBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  }

  const gridRows = filtered.reduce<MarketplaceListing[][]>((acc, item, i) => {
    if (i % 2 === 0) acc.push([item]);
    else acc[acc.length - 1].push(item);
    return acc;
  }, []);

  return (
    <Screen scrollable={false} style={styles.screen} backgroundColor={PAGE_BG}>
      <ScrollView
        style={styles.flex}
        // Clears the bar and the + button above it. The empty state pads itself
        // instead, so its colour runs under the bar.
        contentContainerStyle={[styles.scrollContent, empty ? null : { paddingBottom: tabBarHeight + FAB_SIZE + TAB_BAR_CONTENT_GAP * 2 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        // An empty market ends the page (no scrolling past the empty state) —
        // when it fits the screen; a phone too short for it still scrolls.
        scrollEnabled={!locked}
        bounces={!locked}
        onScroll={companyRentalsOn ? onPageScroll : undefined}
        scrollEventThrottle={200}
      >
        {/* Toggle + mode description, on the violet band */}
        <GradientBand style={styles.band} flip>
          <MarketplaceToggle active={activeTab} onChange={(tab) => { setActiveTab(tab); setFilterCondition(null); setPartnerId(null); }} />

          {/* Mode description — switches with the selected toggle mode */}
          <AppText weight="regular" numberOfLines={1} style={styles.modeDesc}>
            {t(activeTab === 'rental' ? 'marketplace.mode_desc_rental' : 'marketplace.mode_desc_market')}
          </AppText>
        </GradientBand>

        <View style={[styles.sheet, empty && styles.sheetEmpty]}>
        {/* Search + filter button at its end — the same pair as the courses tab. */}
        <View style={[styles.searchRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <View style={[styles.searchWrap, styles.searchWrapFlex, searchFocused && styles.searchWrapFocused, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <TextInput
              style={[styles.searchBar, webNoOutline, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
              placeholder={rtlSafe(t('marketplace.search_placeholder'), rtl)}
              placeholderTextColor="#9C99AD"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            <Search size={18} color={searchIconColor} strokeWidth={2} />
          </View>
          <TouchableOpacity
            style={[styles.filterBtn, filtersActive && styles.filterBtnActive]}
            onPress={openFilterModal}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('marketplace.filter')}
          >
            <SlidersHorizontal size={18} color={BLUE} strokeWidth={2.2} />
            {activeFilterTags.length > 0 && (
              <View style={styles.filterBadge}>
                <Text style={[styles.filterBadgeText, { ...font.bold }]}>{activeFilterTags.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Categories — the row runs to the screen edges (see categoriesScroll) */}
        <View style={styles.categoriesWrapper}>
          <ScrollView
            horizontal
            {...tabSwipeLockProps}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesRow}
            style={styles.categoriesScroll}
          >
            {CATEGORIES.map((cat) => (
              <CategoryTile
                key={cat.id}
                cat={cat}
                label={t(`marketplace.${cat.labelKey}`)}
                isActive={selectedCategory === cat.id}
                onPress={() => setSelectedCategory(cat.id)}
                inactiveLabelColor={TEXT}
              />
            ))}
          </ScrollView>
        </View>

        {companyRentalsOn && (
          <PartnerRow
            companies={partners}
            selectedId={partnerId}
            onSelect={setPartnerId}
            rtl={rtl}
            title={t('rentals.partners_title')}
            badge={t('rentals.partner_badge')}
          />
        )}

        {/* Active filter tags */}
        {activeFilterTags.length > 0 && (
          <View style={styles.filterBarRow}>
            <ScrollView
              horizontal
              {...tabSwipeLockProps}
              showsHorizontalScrollIndicator={false}
              style={styles.tagsScroll}
              contentContainerStyle={styles.tagsContent}
            >
              {activeFilterTags.map((tag) => (
                <View key={tag.key} style={styles.activeTag}>
                  <AppText weight="semiBold" style={styles.activeTagText}>{tag.label}</AppText>
                  <TouchableOpacity
                    onPress={tag.onRemove}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                  >
                    <Text style={styles.activeTagRemove}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Product grid */}
        {gridLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={BLUE} />
          </View>
        ) : empty ? (
          <AnimatedEmptyState
            // Cancels the sheet's paddingHorizontal: the empty state spans the screen.
            bleed={20}
            // The sheet takes the panel's colour while empty, so no corners of its own.
            radius={0}
            bottomInset={tabBarHeight + TAB_BAR_CONTENT_GAP}
            onFitsChange={setEmptyFits}
            variant="listings"
            title={t(empty === 'filtered' ? 'marketplace.empty_filtered_title' : empty === 'rental' ? 'marketplace.empty_rental_title' : 'marketplace.empty_market_title')}
            subtitle={t(empty === 'filtered' ? 'marketplace.empty_filtered_desc' : empty === 'rental' ? 'marketplace.empty_rental_desc' : 'marketplace.empty_market_desc')}
            // After a failed mailto the address stays on screen, selectable.
            note={empty === 'rental' && rentalMail.failed ? rentalMail.email : undefined}
            primaryCta={empty === 'filtered'
              ? { label: t('marketplace.empty_filtered_cta'), onPress: clearSearchAndFilters }
              // Nothing to post on the rental tab (new rentals are admin-only): ask to become a supplier.
              : empty === 'rental'
                ? { label: t('marketplace.rental_apply_cta'), onPress: () => void rentalMail.open() }
                : {
                  label: t('marketplace.empty_market_cta'),
                  icon: <Plus size={20} color="#FFFFFF" strokeWidth={2.4} />,
                  onPress: () => setPostSheetVisible(true),
                }}
          />
        ) : (
          <View style={styles.list}>
            {gridRows.map((pair, i) => (
              <View key={i} style={styles.row}>
                {pair.map((item) => (
                  <ListingCard key={item.id} listing={item} onPress={() => setSelectedListing(item)} />
                ))}
                {pair.length === 1 && <View style={styles.halfItem} />}
              </View>
            ))}
            {companyItems.loadingMore && (
              <View style={styles.loadingMore} testID="rentals-loading-more">
                <ActivityIndicator size="small" color={BLUE} />
                <AppText style={styles.loadingMoreText}>{t('rentals.loading_more')}</AppText>
              </View>
            )}
          </View>
        )}
        </View>
      </ScrollView>

      {/* FAB — fixed above tab bar, outside the ScrollView. Hidden while the
          empty state shows: its own button does the same. */}
      {!empty && (
        <>
          {canPost && (
            <TouchableOpacity style={[styles.fab, { bottom: tabBarHeight + TAB_BAR_CONTENT_GAP }]} onPress={() => setPostSheetVisible(true)} activeOpacity={0.85}>
              <LinearGradient
                colors={[BLUE, BLUE]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.fabFill}
              >
                <Plus size={24} color="#FFFFFF" strokeWidth={2.4} />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Filter modal */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.filterOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setFilterModalVisible(false)} />
          <View style={styles.filterCard}>
            {/* Header */}
            <View style={[styles.filterCardHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <AppText weight="bold" style={[styles.filterCardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('marketplace.filters_title')}
              </AppText>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={styles.filterCloseBtn} activeOpacity={0.7}>
                <X size={20} color={BLUE} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.filterScroll}>
              {/* Price */}
              <AppText weight="semiBold" style={[styles.filterSectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('marketplace.price')}
              </AppText>
              <View style={[styles.filterChipRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                {(['asc', 'desc', null] as const).map((val) => (
                  <TouchableOpacity
                    key={String(val)}
                    style={[styles.filterChip, draftPriceSort === val && styles.filterChipActive]}
                    onPress={() => setDraftPriceSort(val)}
                    activeOpacity={0.8}
                  >
                    <AppText weight="semiBold" style={[styles.filterChipLabel, draftPriceSort === val && styles.filterChipLabelActive]}>
                      {val === 'asc'
                        ? t('marketplace.price_low_high')
                        : val === 'desc'
                          ? t('marketplace.price_high_low')
                          : t('marketplace.price_any')}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Rental company — rental tab only. The same partnerId as the partner
                  row: its card, the filter tag and Clear always agree with this. */}
              {companyRentalsOn && partners.length > 0 && (
                <>
                  <AppText weight="semiBold" style={[styles.filterSectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                    {t('rentals.filter_company')}
                  </AppText>
                  <CompanyFilterChips
                    companies={partners}
                    value={draftPartnerId}
                    onChange={setDraftPartnerId}
                    allLabel={t('rentals.all_companies')}
                    rtl={rtl}
                  />
                </>
              )}

              {/* Brand */}
              <AppText weight="semiBold" style={[styles.filterSectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('marketplace.brand')}
                {selectedCategory !== 'all' && selectedCatLabelKey
                  ? ` · ${t(`marketplace.${selectedCatLabelKey}`)}`
                  : ''}
              </AppText>
              <View style={[styles.filterChipRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                {availableBrands.map((brand) => {
                  const selected = draftBrands.includes(brand);
                  return (
                    <TouchableOpacity
                      key={brand}
                      style={[styles.filterChip, selected && styles.filterChipActive]}
                      onPress={() => toggleDraftBrand(brand)}
                      activeOpacity={0.8}
                    >
                      <AppText weight="semiBold" style={[styles.filterChipLabel, selected && styles.filterChipLabelActive]}>
                        {brandLabel(brand, rtl ? 'he' : 'en')}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Condition — second-hand only: rentals have no condition. */}
              {activeTab !== 'rental' && (<>
              <AppText weight="semiBold" style={[styles.filterSectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('marketplace.condition')}
              </AppText>
              <View style={[styles.filterChipRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                {([null, ...CONDITIONS]).map((c) => {
                  const val = c === null ? null : c.value;
                  const label = c === null
                    ? t('marketplace.any')
                    : t(`marketplace.condition_${c.value}`);
                  return (
                    <TouchableOpacity
                      key={String(val)}
                      style={[styles.filterChip, draftCondition === val && styles.filterChipActive]}
                      onPress={() => setDraftCondition(val)}
                      activeOpacity={0.8}
                    >
                      <AppText weight="semiBold" style={[styles.filterChipLabel, draftCondition === val && styles.filterChipLabelActive]}>
                        {label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
              </>)}
            </ScrollView>

            {/* Actions */}
            <View style={[styles.filterActions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity style={styles.filterClearBtn} onPress={clearFilters} activeOpacity={0.7}>
                <AppText weight="semiBold" style={styles.filterClearText}>{t('marketplace.clear_all')}</AppText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.filterApplyBtn} onPress={applyFilters} activeOpacity={0.85}>
                <AppText weight="bold" style={styles.filterApplyText}>{t('marketplace.apply_filters')}</AppText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ListingDetailModal
        listing={selectedListing}
        onClose={() => setSelectedListing(null)}
        onEdit={(l) => { setSelectedListing(null); setEditListing(l); }}
      />
      <PostListingSheet
        key={activeTab}
        visible={postSheetVisible}
        initialType={activeTab}
        lockedType
        onClose={() => setPostSheetVisible(false)}
      />
      <PostListingSheet
        key={editListing?.id ?? 'edit'}
        visible={!!editListing}
        initialType={editListing?.type ?? activeTab}
        lockedType
        editListing={editListing ?? undefined}
        onClose={() => setEditListing(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  loadingMoreText: { fontSize: 12, color: '#555555' },
  screen: { gap: 0 },
  flex: { flex: 1 },
  // Grows so the sheet reaches the bottom. paddingBottom is set inline: the
  // bar's height + the + button + gaps.
  scrollContent: { flexGrow: 1 },

  band: { paddingTop: 18, paddingHorizontal: 20, paddingBottom: 38 },
  /** Overlaps the band's bottom edge; zIndex so it paints over the gradient. */
  sheet: {
    flexGrow: 1,
    backgroundColor: PAGE_BG,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginTop: -22,
    zIndex: 1,
    paddingTop: 16,
    paddingHorizontal: 20,
    ...shadow({ color: '#4C1D95', opacity: 0.09, radius: 14, offsetX: 0, offsetY: -6, elevation: 6 }),
  },
  /** The empty state's panel colour, so sheet and panel read as one. */
  sheetEmpty: { backgroundColor: '#F4F2FB' },

  // The gradient lives on an inner, clipped fill so the shadow on this outer
  // view isn't cut by overflow:hidden.
  fab: {
    position: 'absolute',
    // bottom is set inline: just above the tab bar.
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 999,
    ...shadow({ color: '#1E3A8A', opacity: 0.36, radius: 11, offsetX: 0, offsetY: 8, elevation: 10 }),
  },
  fabFill: { flex: 1, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },

  modeDesc: { fontSize: 12.5, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 10 },

  searchRow: { alignItems: 'center', gap: 8 },
  searchWrapFlex: { flex: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAE8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    gap: 8,
    ...shadow({ color: '#4C1D95', opacity: 0.05, radius: 5, offsetX: 0, offsetY: 2 }),
  },
  searchWrapFocused: { borderColor: BLUE },
  searchBar: {
    flex: 1,
    fontSize: 14,
    color: TEXT,
  },

  // The ‹ › arrows are gone; the strip bleeds 20 past the sheet's padding on
  // both sides, with the same 20 back inside, so a part-scrolled tile reaches
  // the screen edge.
  categoriesWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -20,
    marginTop: -2,
    marginBottom: 12,
  },
  categoriesScroll: {
    flex: 1,
  },
  categoriesRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 2,
    gap: 4,
    marginTop: 0,
  },

  filterBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
  },
  // Same height and shape as the search field beside it (as on courses).
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAE8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // A filter is on: blue outline, plus the count.
  filterBtnActive: { borderColor: BLUE },
  // How many filters are on.
  filterBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 17,
    height: 17,
    borderRadius: 999,
    paddingHorizontal: 4,
    backgroundColor: BLUE,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: { fontSize: 9.5, color: '#FFFFFF', lineHeight: 11 },

  tagsScroll: { flex: 1 },
  tagsContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  activeTagText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  activeTagRemove: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '700' },

  row: { flexDirection: 'row', gap: 11 },
  halfItem: { flex: 1 },
  list: { gap: 11 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 60 },

  filterOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  filterCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    ...shadow({ color: '#000', opacity: 0.2, radius: 20, elevation: 20 }),
  },
  filterCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  filterCardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT,
    paddingRight: 8,
  },
  filterCloseBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  filterScroll: { flexShrink: 1 },

  filterSectionLabel: {
    fontSize: 12,
    color: TEXT,
    marginBottom: 8,
    marginTop: 10,
  },
  filterChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BLUE,
    backgroundColor: '#ffffff',
  },
  filterChipActive: { backgroundColor: BLUE, borderColor: BLUE },
  filterChipLabel: { fontSize: 13, fontWeight: '600', color: TEXT },
  filterChipLabelActive: { color: '#fff' },

  filterModalInput: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: TEXT,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BLUE,
  },

  filterActions: {
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
  },
  filterClearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  filterClearText: { color: TEXT, fontSize: 14 },
  filterApplyBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: BLUE,
  },
  filterApplyText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

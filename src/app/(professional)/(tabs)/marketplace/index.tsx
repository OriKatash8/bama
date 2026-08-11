import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Platform, Animated, Modal,
} from 'react-native';
import { AppText } from '@components/ui/AppText';
import { Image } from 'expo-image';

import { LinearGradient } from 'expo-linear-gradient';
import { SlidersHorizontal, X, Search, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { MarketplaceToggle } from '@features/marketplace/components/MarketplaceToggle';
import { ListingCard } from '@features/marketplace/components/ListingCard';
import { ListingDetailModal } from '@features/marketplace/components/ListingDetailModal';
import { PostListingSheet } from '@features/marketplace/components/PostListingSheet';
import { useMarketplaceListings } from '@features/marketplace/hooks/useMarketplaceListings';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { MarketplaceListing, MarketplaceListingType, ProductCondition } from '@features/marketplace/types';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

type Category = {
  id: string;
  labelKey: string;
  icon: number;
  selectedIcon?: number;
};

const CATEGORIES: Category[] = [
  {
    id: 'camera',
    labelKey: 'category_camera',
    icon: require('../../../../../assets/images/categories/camera.png'),
    selectedIcon: require('../../../../../assets/images/categories/photographer.png'),
  },
  {
    id: 'lens',
    labelKey: 'category_lens',
    icon: require('../../../../../assets/images/categories/101.png'),
    selectedIcon: require('../../../../../assets/images/categories/10.png'),
  },
  {
    id: 'audio',
    labelKey: 'category_audio',
    icon: require('../../../../../assets/images/categories/audio.png'),
    selectedIcon: require('../../../../../assets/images/categories/12.png'),
  },
  {
    id: 'lighting',
    labelKey: 'category_light',
    icon: require('../../../../../assets/images/categories/teuraicon.png'),
    selectedIcon: require('../../../../../assets/images/categories/lighting.png'),
  },
  {
    id: 'drone',
    labelKey: 'category_drone',
    icon: require('../../../../../assets/images/categories/drone.png'),
    selectedIcon: require('../../../../../assets/images/categories/11.png'),
  },
  {
    id: 'accessories',
    labelKey: 'category_accessories',
    icon: require('../../../../../assets/images/categories/studio.png'),
    selectedIcon: require('../../../../../assets/images/categories/14.png'),
  },
];

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

type CategoryTileProps = {
  cat: Category;
  label: string;
  isActive: boolean;
  onPress: () => void;
  inactiveLabelColor: string;
};

function CategoryTile({ cat, label, isActive, onPress, inactiveLabelColor }: CategoryTileProps) {
  const anim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: isActive ? 1 : 0,
      useNativeDriver: true,
      damping: 15,
      stiffness: 200,
      mass: 1,
    }).start();
  }, [isActive, anim]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.33] });
  const iconSource = isActive && cat.selectedIcon ? cat.selectedIcon : cat.icon;

  return (
    <TouchableOpacity style={styles.catItem} onPress={onPress} activeOpacity={0.75}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image source={iconSource} style={styles.tileIcon} contentFit="contain" cachePolicy="memory-disk" />
      </Animated.View>
      <AppText weight="semiBold" style={[styles.catLabel, { color: isActive ? '#004aad' : inactiveLabelColor }]}>
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

const CONDITIONS: { value: ProductCondition }[] = [
  { value: 'new' },
  { value: 'like_new' },
  { value: 'good' },
  { value: 'fair' },
];

type FilterTag = { key: string; label: string; onRemove: () => void };

export default function MarketplaceScreen() {
  const [activeTab, setActiveTab]               = useState<MarketplaceListingType>('secondhand');
  const [searchQuery, setSearchQuery]           = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedListing, setSelectedListing]   = useState<MarketplaceListing | null>(null);
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

  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const { listings, isLoading } = useMarketplaceListings(activeTab);

  const filtered = useMemo(() => {
    let result = listings.filter((l) =>
      l.productName.toLowerCase().includes(searchQuery.toLowerCase())
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
    if (priceSort === 'asc') result = [...result].sort((a, b) => a.price - b.price);
    if (priceSort === 'desc') result = [...result].sort((a, b) => b.price - a.price);
    return result;
  }, [listings, searchQuery, selectedCategory, filterBrands, filterCondition, priceSort]);

  const filtersActive = priceSort !== null || filterBrands.length > 0 || !!filterCondition;

  const activeFilterTags: FilterTag[] = [
    ...(priceSort ? [{
      key: 'price',
      label: priceSort === 'asc' ? t('marketplace.filter_price_low') : t('marketplace.filter_price_high'),
      onRemove: () => setPriceSort(null),
    }] : []),
    ...(filterBrands.length > 0 ? [{
      key: 'brand',
      label: `${t('marketplace.filter_brand')}: ${filterBrands.join(', ')}`,
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
    setFilterModalVisible(true);
  }

  function applyFilters() {
    setPriceSort(draftPriceSort);
    setFilterBrands(draftBrands);
    setFilterCondition(draftCondition);
    setFilterModalVisible(false);
  }

  function clearFilters() {
    setDraftPriceSort(null);
    setDraftBrands([]);
    setDraftLocation('');
    setDraftCondition(null);
    setPriceSort(null);
    setFilterBrands([]);
    setFilterLocation('');
    setFilterCondition(null);
    setFilterModalVisible(false);
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
    <Screen scrollable={false} style={styles.screen}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Toggle */}
        <View style={styles.toggleWrap}>
          <MarketplaceToggle active={activeTab} onChange={(tab) => { setActiveTab(tab); setFilterCondition(null); }} />
        </View>

        {/* Search */}
        <View style={[styles.searchWrap, { flexDirection: rtl ? 'row-reverse' : 'row', borderColor: colors.borderMuted }]}>
          <Search size={18} color={colors.placeholder} strokeWidth={2} />
          <TextInput
            style={[styles.searchBar, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
            placeholder={t('marketplace.search_placeholder')}
            placeholderTextColor={colors.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Categories */}
        <View style={styles.categoriesWrapper}>
          <ChevronLeft size={18} color="rgba(0,74,173,0.35)" strokeWidth={2.5} style={styles.catArrow} />
          <ScrollView
            horizontal
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
                inactiveLabelColor={colors.textMuted}
              />
            ))}
          </ScrollView>
          <ChevronRight size={18} color="rgba(0,74,173,0.35)" strokeWidth={2.5} style={styles.catArrow} />
        </View>

        {/* Filter button + active tags */}
        <View style={styles.filterBarRow}>
          <TouchableOpacity
            style={[
              styles.filterBtn,
              { borderColor: filtersActive ? '#004aad' : colors.border },
              filtersActive && styles.filterBtnActive,
            ]}
            onPress={openFilterModal}
            activeOpacity={0.8}
          >
            <SlidersHorizontal size={15} color={filtersActive ? '#fff' : colors.text} strokeWidth={2} />
            <AppText weight="semiBold" style={[styles.filterBtnText, { color: filtersActive ? '#fff' : colors.text }]}>
              {t('marketplace.filter')}
            </AppText>
          </TouchableOpacity>

          {activeFilterTags.length > 0 && (
            <ScrollView
              horizontal
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
          )}
        </View>

        {/* Product grid */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#004aad" />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <AppText weight="semiBold" style={[styles.emptyText, { color: colors.textSec }]}>{t('marketplace.no_listings')}</AppText>
          </View>
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
          </View>
        )}
      </ScrollView>

      {/* FAB — fixed above tab bar, outside the ScrollView */}
      <TouchableOpacity style={styles.fab} onPress={() => setPostSheetVisible(true)} activeOpacity={0.8}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Filter modal */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.filterOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setFilterModalVisible(false)} />
          <LinearGradient
            colors={['#efd4f6', '#b7cae6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.filterCard}
          >
            {/* Header */}
            <View style={[styles.filterCardHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <AppText weight="bold" style={[styles.filterCardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('marketplace.filters_title')}
              </AppText>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={styles.filterCloseBtn} activeOpacity={0.7}>
                <X size={20} color="#004aad" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.filterScroll}>
              {/* Price */}
              <AppText weight="bold" style={[styles.filterSectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('marketplace.price')}
              </AppText>
              <View style={styles.filterChipRow}>
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

              {/* Brand */}
              <AppText weight="bold" style={[styles.filterSectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('marketplace.brand')}
                {selectedCategory !== 'all' && selectedCatLabelKey
                  ? ` · ${t(`marketplace.${selectedCatLabelKey}`)}`
                  : ''}
              </AppText>
              <View style={styles.brandGrid}>
                {availableBrands.map((brand) => {
                  const selected = draftBrands.includes(brand);
                  return (
                    <TouchableOpacity
                      key={brand}
                      style={[
                        styles.brandPill,
                        { borderColor: selected ? '#004aad' : colors.border },
                        selected && styles.brandPillActive,
                      ]}
                      onPress={() => toggleDraftBrand(brand)}
                      activeOpacity={0.8}
                    >
                      <AppText weight="semiBold" style={[styles.brandPillLabel, { color: selected ? '#fff' : colors.text }]}>
                        {brand}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Condition */}
              <AppText weight="bold" style={[styles.filterSectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('marketplace.condition')}
              </AppText>
              <View style={styles.filterChipRow}>
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
            </ScrollView>

            {/* Actions */}
            <View style={styles.filterActions}>
              <TouchableOpacity style={styles.filterClearBtn} onPress={clearFilters} activeOpacity={0.8}>
                <AppText weight="bold" style={styles.filterClearText}>{t('marketplace.clear_all')}</AppText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.filterApplyBtn} onPress={applyFilters} activeOpacity={0.8}>
                <AppText weight="bold" style={styles.filterApplyText}>{t('marketplace.apply_filters')}</AppText>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>

      <ListingDetailModal listing={selectedListing} onClose={() => setSelectedListing(null)} />
      <PostListingSheet
        visible={postSheetVisible}
        initialType={activeTab}
        lockedType
        onClose={() => setPostSheetVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 0 },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  fab: {
    position: 'absolute',
    bottom: 110,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#004aad',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 34 },

  toggleWrap: { paddingHorizontal: 16, paddingVertical: 4, marginTop: 12 },

  searchWrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 50,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    fontSize: 15,
  },

  categoriesWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  categoriesScroll: {
    flex: 1,
  },
  catArrow: {
    paddingHorizontal: 2,
  },
  categoriesRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
    marginTop: 0,
  },
  catItem: {
    width: 112,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  tileIcon: { width: 96, height: 96 },
  catLabel: { fontSize: 13, fontWeight: '600' },

  filterBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  filterBtnActive: { backgroundColor: '#004aad' },
  filterBtnText: { fontSize: 14, fontWeight: '600' },

  tagsScroll: { flex: 1, marginLeft: 8 },
  tagsContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004aad',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  activeTagText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  activeTagRemove: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '700' },

  row: { flexDirection: 'row', paddingHorizontal: 12, gap: 10 },
  halfItem: { flex: 1 },
  list: { gap: 10 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 60 },
  emptyText: { fontSize: 17, fontWeight: '600' },

  filterOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  filterCard: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
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
    color: '#004aad',
    paddingRight: 8,
  },
  filterCloseBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  filterScroll: { flexShrink: 1 },

  filterSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#004aad',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  filterChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
    backgroundColor: '#ffffff',
  },
  filterChipActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  filterChipLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(0,0,0,0.5)' },
  filterChipLabelActive: { color: '#fff' },

  brandGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  brandPill: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    margin: 4,
  },
  brandPillActive: { backgroundColor: '#004aad' },
  brandPillLabel: { fontSize: 13, fontWeight: '600' },

  filterModalInput: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1a1a2e',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
  },

  filterActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  filterClearBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#004aad',
  },
  filterClearText: { color: '#004aad', fontSize: 15, fontWeight: '700' },
  filterApplyBtn: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#004aad',
  },
  filterApplyText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

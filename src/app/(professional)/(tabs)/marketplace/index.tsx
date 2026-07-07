import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, Image, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Platform, Animated,
} from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { Screen } from '@components/layout/Screen';
import { MarketplaceToggle } from '@features/marketplace/components/MarketplaceToggle';
import { ListingCard } from '@features/marketplace/components/ListingCard';
import { ListingDetailModal } from '@features/marketplace/components/ListingDetailModal';
import { PostListingSheet } from '@features/marketplace/components/PostListingSheet';
import { useMarketplaceListings } from '@features/marketplace/hooks/useMarketplaceListings';
import { useTheme } from '@core/hooks/useTheme';
import { AllIcon, LensIcon, MoreIcon } from '@features/marketplace/components/CategoryIcons';
import type { MarketplaceListing, MarketplaceListingType, ProductCondition } from '@features/marketplace/types';

type Category = {
  id: string;
  icon?: ImageSourcePropType;
  selectedIcon?: ImageSourcePropType;
  SvgIcon?: () => React.ReactElement;
  label: string;
};

const CATEGORIES: Category[] = [
  { id: 'all', SvgIcon: AllIcon, label: 'All' },
  {
    id: 'camera',
    icon: require('../../../../../assets/images/categories/camera.png'),
    selectedIcon: require('../../../../../assets/images/categories/camera-selected.png'),
    label: 'Camera',
  },
  { id: 'lens', SvgIcon: LensIcon, label: 'Lens' },
  {
    id: 'audio',
    icon: require('../../../../../assets/images/categories/audio.png'),
    selectedIcon: require('../../../../../assets/images/categories/sound-selected.png'),
    label: 'Audio',
  },
  {
    id: 'lighting',
    icon: require('../../../../../assets/images/categories/teuraicon.png'),
    selectedIcon: require('../../../../../assets/images/categories/lighting-selected.png'),
    label: 'Light',
  },
  {
    id: 'drone',
    icon: require('../../../../../assets/images/categories/drone.png'),
    selectedIcon: require('../../../../../assets/images/categories/drone-selected.png'),
    label: 'Drone',
  },
  {
    id: 'studio',
    icon: require('../../../../../assets/images/categories/studio.png'),
    selectedIcon: require('../../../../../assets/images/categories/studios.png'),
    label: 'Studio',
  },
  { id: 'accessories', SvgIcon: MoreIcon, label: 'More' },
];

type CategoryTileProps = {
  cat: Category;
  isActive: boolean;
  onPress: () => void;
  inactiveLabelColor: string;
};

function CategoryTile({ cat, isActive, onPress, inactiveLabelColor }: CategoryTileProps) {
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

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.333] });
  const iconSource = isActive && cat.selectedIcon ? cat.selectedIcon : cat.icon;

  return (
    <TouchableOpacity style={styles.catItem} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.catIconShadow, isActive && styles.catIconShadowActive]}>
        <Animated.View style={{ transform: [{ scale }] }}>
          {iconSource ? (
            <Image source={iconSource} style={styles.catIcon} resizeMode="contain" />
          ) : cat.SvgIcon ? (
            <cat.SvgIcon />
          ) : null}
        </Animated.View>
      </View>
      <Text style={[styles.catLabel, { color: isActive ? '#cb6ce6' : inactiveLabelColor }]}>
        {cat.label}
      </Text>
    </TouchableOpacity>
  );
}

const CONDITIONS: { value: ProductCondition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
];

type ActiveFilter = 'price' | 'brand' | 'location' | 'condition' | null;

export default function MarketplaceScreen() {
  const [activeTab, setActiveTab] = useState<MarketplaceListingType>('secondhand');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [postSheetVisible, setPostSheetVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);

  const [priceSort, setPriceSort] = useState<'asc' | 'desc' | null>(null);
  const [filterBrand, setFilterBrand] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterCondition, setFilterCondition] = useState<ProductCondition | null>(null);

  const colors = useTheme();
  const { listings, isLoading } = useMarketplaceListings(activeTab);

  const filtered = useMemo(() => {
    let result = listings.filter((l) =>
      l.productName.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (selectedCategory !== 'all') {
      result = result.filter((l) => l.category === selectedCategory);
    }
    if (filterBrand) {
      result = result.filter((l) => l.brand?.toLowerCase().includes(filterBrand.toLowerCase()));
    }
    if (filterLocation) {
      result = result.filter((l) => l.location.toLowerCase().includes(filterLocation.toLowerCase()));
    }
    if (filterCondition) {
      result = result.filter((l) => l.condition === filterCondition);
    }
    if (priceSort === 'asc') result = [...result].sort((a, b) => a.price - b.price);
    if (priceSort === 'desc') result = [...result].sort((a, b) => b.price - a.price);
    return result;
  }, [listings, searchQuery, selectedCategory, filterBrand, filterLocation, filterCondition, priceSort]);

  const gradientText = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  } as any) : {};

  const filtersActive = priceSort !== null || filterBrand || filterLocation || filterCondition;

  return (
    <Screen scrollable={false} style={styles.screen}>
      {/* Page title */}
      <View style={styles.titleRow}>
        <Text style={[styles.titleBama, gradientText]}>BAMA</Text>
        <Text style={[styles.titleMarket, gradientText]}>{activeTab === 'rental' ? ' Rental' : ' Market'}</Text>
      </View>

      {/* Toggle */}
      <View style={styles.toggleWrap}>
        <MarketplaceToggle active={activeTab} onChange={(t) => { setActiveTab(t); setFilterCondition(null); }} />
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={[styles.searchBar, { backgroundColor: colors.cardAlt, color: colors.text, borderColor: colors.borderMuted }]}
          placeholder="Search equipment..."
          placeholderTextColor={colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Categories */}
      <View style={styles.categoriesRow}>
        {CATEGORIES.map((cat) => (
          <CategoryTile
            key={cat.id}
            cat={cat}
            isActive={selectedCategory === cat.id}
            onPress={() => setSelectedCategory(cat.id)}
            inactiveLabelColor={colors.textMuted}
          />
        ))}
      </View>

      {/* Filters */}
      <View style={styles.filtersRow}>
        {/* Price */}
        <TouchableOpacity
          style={[styles.filterPill, { borderColor: colors.border }, priceSort && styles.filterPillActive]}
          onPress={() => setActiveFilter(activeFilter === 'price' ? null : 'price')}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterPillText, { color: priceSort ? '#fff' : colors.text }]}>
            Price{priceSort === 'asc' ? ' ↑' : priceSort === 'desc' ? ' ↓' : ''}
          </Text>
        </TouchableOpacity>

        {/* Brand */}
        <TouchableOpacity
          style={[styles.filterPill, { borderColor: colors.border }, filterBrand && styles.filterPillActive]}
          onPress={() => setActiveFilter(activeFilter === 'brand' ? null : 'brand')}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterPillText, { color: filterBrand ? '#fff' : colors.text }]}>
            {filterBrand ? `Brand: ${filterBrand}` : 'Brand'}
          </Text>
        </TouchableOpacity>

        {/* Location */}
        <TouchableOpacity
          style={[styles.filterPill, { borderColor: colors.border }, filterLocation && styles.filterPillActive]}
          onPress={() => setActiveFilter(activeFilter === 'location' ? null : 'location')}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterPillText, { color: filterLocation ? '#fff' : colors.text }]}>
            {filterLocation ? `📍 ${filterLocation}` : '📍 Location'}
          </Text>
        </TouchableOpacity>

        {/* Condition */}
        <TouchableOpacity
          style={[styles.filterPill, { borderColor: colors.border }, filterCondition && styles.filterPillActive]}
          onPress={() => setActiveFilter(activeFilter === 'condition' ? null : 'condition')}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterPillText, { color: filterCondition ? '#fff' : colors.text }]}>
            {filterCondition ? filterCondition.replace('_', ' ') : 'Condition'}
          </Text>
        </TouchableOpacity>

        {filtersActive && (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillClear]}
            onPress={() => { setPriceSort(null); setFilterBrand(''); setFilterLocation(''); setFilterCondition(null); }}
            activeOpacity={0.8}
          >
            <Text style={styles.filterPillText}>✕ Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter panel */}
      {activeFilter === 'price' && (
        <View style={[styles.filterPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(['asc', 'desc', null] as const).map((val) => (
            <TouchableOpacity
              key={String(val)}
              style={[styles.filterOption, priceSort === val && styles.filterOptionActive]}
              onPress={() => { setPriceSort(val); setActiveFilter(null); }}
            >
              <Text style={[styles.filterOptionText, { color: colors.text }]}>
                {val === 'asc' ? 'Low to High ↑' : val === 'desc' ? 'High to Low ↓' : 'No sort'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {activeFilter === 'brand' && (
        <View style={[styles.filterPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[styles.filterInput, { color: colors.text, borderColor: colors.border }]}
            placeholder="Filter by brand..."
            placeholderTextColor={colors.placeholder}
            value={filterBrand}
            onChangeText={setFilterBrand}
            autoFocus
            onSubmitEditing={() => setActiveFilter(null)}
          />
        </View>
      )}
      {activeFilter === 'location' && (
        <View style={[styles.filterPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[styles.filterInput, { color: colors.text, borderColor: colors.border }]}
            placeholder="Filter by city..."
            placeholderTextColor={colors.placeholder}
            value={filterLocation}
            onChangeText={setFilterLocation}
            autoFocus
            onSubmitEditing={() => setActiveFilter(null)}
          />
        </View>
      )}
      {activeFilter === 'condition' && (
        <View style={[styles.filterPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {([null, ...CONDITIONS] as const).map((c) => {
            const val = c === null ? null : c.value;
            const label = c === null ? 'Any condition' : c.label;
            return (
              <TouchableOpacity
                key={String(val)}
                style={[styles.filterOption, filterCondition === val && styles.filterOptionActive]}
                onPress={() => { setFilterCondition(val); setActiveFilter(null); }}
              >
                <Text style={[styles.filterOptionText, { color: colors.text }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Product grid */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#cb6ce6" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>{activeTab === 'rental' ? '🎬' : '🏷️'}</Text>
          <Text style={[styles.emptyText, { color: colors.textSec }]}>No listings found</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <ListingCard listing={item} onPress={() => setSelectedListing(item)} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setPostSheetVisible(true)} activeOpacity={0.8}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

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

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#cb6ce6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#cb6ce6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 34 },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  titleBama: { fontSize: 96, fontWeight: '900' },
  titleMarket: { fontSize: 96, fontWeight: '400' },

  toggleWrap: { paddingHorizontal: 16, paddingVertical: 8 },

  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  searchBar: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
  },

  categoriesRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  catItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    gap: 4,
  },
  catIconShadow: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIconShadowActive: {
    shadowColor: '#004aad',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  catIcon: { width: 60, height: 60 },
  catLabel: { fontSize: 13, fontWeight: '600' },

  filtersRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  filterPill: {
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  filterPillActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  filterPillClear: { backgroundColor: '#e53935', borderColor: '#e53935' },
  filterPillText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  filterPanel: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    gap: 2,
  },
  filterOption: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  filterOptionActive: { backgroundColor: 'rgba(0,74,173,0.15)' },
  filterOptionText: { fontSize: 14, fontWeight: '500' },
  filterInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },

  row: { paddingHorizontal: 12, gap: 10 },
  list: { paddingBottom: 24, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 17, fontWeight: '600' },
});

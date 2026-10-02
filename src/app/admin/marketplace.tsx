import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Pencil, ShoppingBag, Trash2 } from 'lucide-react-native';
import { db } from '@core/firebase/config';
import { useUiStore } from '@core/stores/uiStore';
import { confirmDialog } from '@utils/confirmDialog';
import { deleteListing } from '@features/marketplace/services/marketplaceService';
import { PostListingSheet } from '@features/marketplace/components/PostListingSheet';
import type { MarketplaceListing, ListingStatus } from '@features/marketplace/types';
import { PERIOD_SUFFIX_KEY, periodOf } from '@features/marketplace/utils/rentalPrice';
import {
  AdminPage, AdminText, Card, CardHead, CountBadge, EmptyState, IconTile, PillButton, Row, Segment,
  RADIUS, TYPE, useAdminPalette, useScopedT,
} from '@features/admin/ui';

type FilterTab = 'all' | ListingStatus;
const FILTER_TABS: FilterTab[] = ['all', 'available', 'negotiating', 'reserved', 'sold'];

/** Status labels, from `admin_marketplace` (the user-facing "For sale" would mislabel rentals). */
const STATUS_KEY: Record<ListingStatus, string> = {
  available: 'status_available',
  negotiating: 'status_negotiating',
  reserved: 'status_reserved',
  sold: 'status_sold',
};

function fmtDate(seconds?: number): string {
  if (!seconds) return '—';
  const d = new Date(seconds * 1000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** available → good, negotiating → warn, reserved → accent, sold → neutral. */
function StatusChip({ status, label }: { status: ListingStatus; label: string }) {
  const p = useAdminPalette();
  const [bg, fg] = {
    available: [p.goodBg, p.good],
    negotiating: [p.warnBg, p.warn],
    reserved: [p.accentSoft, p.accent],
    sold: [p.surface3, p.text2],
  }[status];
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.chip, { color: fg }]}>
        {label}
      </AdminText>
    </View>
  );
}

export default function MarketplaceAdmin() {
  const p = useAdminPalette();
  const router = useRouter();
  const { showToast } = useUiStore();
  const { t, rowDir, textAlign } = useScopedT('marketplace');
  const { t: tAdm } = useScopedT('admin_marketplace');

  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [addRentalOpen, setAddRentalOpen] = useState(false);
  const [editRental, setEditRental] = useState<MarketplaceListing | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'marketplace_listings'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setListings(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MarketplaceListing)));
      setLoading(false);
    });
  }, []);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/admin/operations');
  }

  /** confirmDialog, not Alert.alert — the latter no-ops on web, where admin runs. */
  async function confirmDelete(listing: MarketplaceListing) {
    const ok = await confirmDialog(t('delete_confirm_title'), `“${listing.productName}”\n${t('delete_confirm_body')}`, {
      confirm: t('delete_listing'), cancel: t('cancel'),
    });
    if (!ok) return;
    setDeleting((prev) => ({ ...prev, [listing.id]: true }));
    try {
      await deleteListing(listing.id, listing.imageUrl);
      showToast(t('listing_deleted'), 'success');
    } catch {
      showToast(t('failed_delete'), 'error');
    } finally {
      setDeleting((prev) => ({ ...prev, [listing.id]: false }));
    }
  }

  // Rentals have their own section (only the admin adds them); the status
  // filter and the second card are the 2nd-hand market.
  const rentals = listings.filter((l) => l.type === 'rental');
  const market = listings.filter((l) => l.type !== 'rental');
  const statusOf = (l: MarketplaceListing) => (l.status ?? 'available') as ListingStatus;
  const countOf = (tab: FilterTab) => (tab === 'all' ? market.length : market.filter((l) => statusOf(l) === tab).length);
  const filtered = filter === 'all' ? market : market.filter((l) => statusOf(l) === filter);
  const tabLabel = (tab: FilterTab) => (tab === 'all' ? tAdm('filter_all') : tAdm(STATUS_KEY[tab]));

  function renderRow(listing: MarketplaceListing) {
    const status = statusOf(listing);
    const busy = !!deleting[listing.id];
    const price = listing.price?.toLocaleString?.() ?? listing.price;
    return (
      <Row key={listing.id} rowDir={rowDir} testID={`listing-${listing.id}`}>
        {listing.imageUrl ? (
          <Image source={{ uri: listing.imageUrl }} style={[styles.thumb, { backgroundColor: p.surface3 }]} resizeMode="cover" />
        ) : (
          <IconTile icon={ShoppingBag} tone="neutral" />
        )}
        <View style={styles.info}>
          <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.rowName, { textAlign }]}>
            {listing.productName}
          </AdminText>
          <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>
            {listing.type === 'rental'
              ? `${t('rental')} · ₪${price}${t(PERIOD_SUFFIX_KEY[periodOf(listing)])}`
              : `${t('for_sale')} · ₪${price}`}
          </AdminText>
          <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
            {/* A rental belongs to a store: name the store, not who posted it. */}
            {[listing.type === 'rental' ? listing.storeName || '—' : listing.posterName, listing.location, fmtDate(listing.createdAt?.seconds)].join(' · ')}
          </AdminText>
          <View style={[styles.chipRow, { flexDirection: rowDir }]}>
            <StatusChip status={status} label={tAdm(STATUS_KEY[status])} />
          </View>
        </View>
        {listing.type === 'rental' && (
          <Pressable
            onPress={() => setEditRental(listing)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${t('edit_listing')} ${listing.productName}`}
            testID={`edit-${listing.id}`}
            style={({ pressed }) => [styles.deleteBtn, { backgroundColor: pressed ? p.surface3 : p.accentSoft }]}
          >
            <Pencil size={16} color={p.accent} strokeWidth={2.2} />
          </Pressable>
        )}
        <Pressable
          onPress={() => void confirmDelete(listing)}
          disabled={busy}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${t('delete_listing')} ${listing.productName}`}
          testID={`delete-${listing.id}`}
          style={({ pressed }) => [styles.deleteBtn, { backgroundColor: pressed ? p.bad : p.badBg }]}
        >
          {({ pressed }) =>
            busy ? (
              <ActivityIndicator size="small" color={p.bad} testID={`deleting-${listing.id}`} />
            ) : (
              <Trash2 size={16} color={pressed ? p.onAccent : p.bad} strokeWidth={2.2} />
            )
          }
        </Pressable>
      </Row>
    );
  }

  return (
    <AdminPage title={tAdm('title')} subtitle={tAdm('subtitle')} onBack={goBack} testID="marketplace-page">
      {loading ? (
        <ActivityIndicator size="large" color={p.accent} style={styles.spinner} testID="marketplace-loading" />
      ) : (
        <>
          {/* BAMA Rental: only the admin adds to it. */}
          <Card testID="rentals-card">
            <CardHead
              title={tAdm('rentals')}
              sub={tAdm('rentals_sub')}
              side={
                <View style={[styles.headSide, { flexDirection: rowDir }]}>
                  <CountBadge n={rentals.length} testID="rentals-count" />
                  <PillButton variant="primary" label={tAdm('add_rental')} onPress={() => setAddRentalOpen(true)} testID="add-rental" />
                </View>
              }
            />
            {rentals.length === 0 ? (
              <EmptyState text={tAdm('no_rentals')} testID="rentals-empty" />
            ) : (
              rentals.map(renderRow)
            )}
          </Card>

          {/* 2nd-hand status filter: a pill segmented control with counts; scrolls sideways on narrow phones. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterRow, { flexDirection: rowDir }]}>
            <Segment<FilterTab>
              options={FILTER_TABS.map((tab) => ({ value: tab, label: `${tabLabel(tab)} (${countOf(tab)})` }))}
              value={filter}
              onChange={setFilter}
              label={tAdm('title')}
              testIDPrefix="filter"
            />
          </ScrollView>

          <Card testID="listings-card">
            <CardHead title={tabLabel(filter)} sub={t('second_hand')} side={<CountBadge n={filtered.length} testID="listings-count" />} />
            {filtered.length === 0 ? (
              <EmptyState text={t('no_listings')} testID="listings-empty" />
            ) : (
              filtered.map(renderRow)
            )}
          </Card>
        </>
      )}

      {/* The app's own "add a listing" popup, locked to Rental. */}
      <PostListingSheet
        visible={addRentalOpen}
        initialType="rental"
        lockedType
        onClose={() => setAddRentalOpen(false)}
      />
      {/* Edit a rental (e.g. give an older one its store and link). Keyed so it re-reads the listing. */}
      {editRental && (
        <PostListingSheet
          key={editRental.id}
          visible
          initialType="rental"
          lockedType
          editListing={editRental}
          onClose={() => setEditRental(null)}
        />
      )}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexGrow: 1 },
  headSide: { alignItems: 'center', gap: 8 },
  spinner: { marginTop: 40 },
  thumb: { width: 44, height: 44, borderRadius: RADIUS.card / 2, flexShrink: 0 },
  info: { flex: 1, minWidth: 0, gap: 2 },
  chipRow: { marginTop: 3 },
  chip: { borderRadius: RADIUS.pill, paddingVertical: 3, paddingHorizontal: 9, flexShrink: 0 },
  deleteBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

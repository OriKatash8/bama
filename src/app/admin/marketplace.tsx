import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { ShoppingBag, Trash2 } from 'lucide-react-native';
import { db } from '@core/firebase/config';
import { useUiStore } from '@core/stores/uiStore';
import { deleteListing } from '@features/marketplace/services/marketplaceService';
import type { MarketplaceListing, ListingStatus } from '@features/marketplace/types';
import {
  AdminPage, AdminText, Card, CardHead, CountBadge, EmptyState, IconTile, Row, Segment,
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

  function confirmDelete(listing: MarketplaceListing) {
    Alert.alert(t('delete_confirm_title'), `“${listing.productName}”\n${t('delete_confirm_body')}`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete_listing'),
        style: 'destructive',
        onPress: async () => {
          setDeleting((prev) => ({ ...prev, [listing.id]: true }));
          try {
            await deleteListing(listing.id, listing.imageUrl);
            showToast(t('listing_deleted'), 'success');
          } catch {
            showToast(t('failed_delete'), 'error');
          } finally {
            setDeleting((prev) => ({ ...prev, [listing.id]: false }));
          }
        },
      },
    ]);
  }

  const statusOf = (l: MarketplaceListing) => (l.status ?? 'available') as ListingStatus;
  const countOf = (tab: FilterTab) => (tab === 'all' ? listings.length : listings.filter((l) => statusOf(l) === tab).length);
  const filtered = filter === 'all' ? listings : listings.filter((l) => statusOf(l) === filter);
  const tabLabel = (tab: FilterTab) => (tab === 'all' ? tAdm('filter_all') : tAdm(STATUS_KEY[tab]));

  return (
    <AdminPage title={tAdm('title')} subtitle={tAdm('subtitle')} onBack={goBack} testID="marketplace-page">
      {/* Filter: a pill segmented control with counts; scrolls sideways on narrow phones. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterRow, { flexDirection: rowDir }]}>
        <Segment<FilterTab>
          options={FILTER_TABS.map((tab) => ({ value: tab, label: `${tabLabel(tab)} (${countOf(tab)})` }))}
          value={filter}
          onChange={setFilter}
          label={tAdm('title')}
          testIDPrefix="filter"
        />
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={p.accent} style={styles.spinner} testID="marketplace-loading" />
      ) : (
        <Card testID="listings-card">
          <CardHead title={tabLabel(filter)} side={<CountBadge n={filtered.length} testID="listings-count" />} />
          {filtered.length === 0 ? (
            <EmptyState text={t('no_listings')} testID="listings-empty" />
          ) : (
            filtered.map((listing) => {
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
                      {`${listing.type === 'rental' ? t('rental') : t('for_sale')} · ₪${price}`}
                    </AdminText>
                    <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
                      {`${listing.posterName} · ${listing.location} · ${fmtDate(listing.createdAt?.seconds)}`}
                    </AdminText>
                    <View style={[styles.chipRow, { flexDirection: rowDir }]}>
                      <StatusChip status={status} label={tAdm(STATUS_KEY[status])} />
                    </View>
                  </View>
                  <Pressable
                    onPress={() => confirmDelete(listing)}
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
            })
          )}
        </Card>
      )}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexGrow: 1 },
  spinner: { marginTop: 40 },
  thumb: { width: 44, height: 44, borderRadius: RADIUS.card / 2, flexShrink: 0 },
  info: { flex: 1, minWidth: 0, gap: 2 },
  chipRow: { marginTop: 3 },
  chip: { borderRadius: RADIUS.pill, paddingVertical: 3, paddingHorizontal: 9, flexShrink: 0 },
  deleteBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

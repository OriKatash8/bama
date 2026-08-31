import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { ChevronLeft, Trash2 } from 'lucide-react-native';
import { db } from '@core/firebase/config';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useUiStore } from '@core/stores/uiStore';
import { Screen } from '@components/layout/Screen';
import { deleteListing } from '@features/marketplace/services/marketplaceService';
import type { MarketplaceListing, ListingStatus } from '@features/marketplace/types';

type FilterTab = 'all' | ListingStatus;
const FILTER_TABS: FilterTab[] = ['all', 'available', 'negotiating', 'reserved', 'sold'];

const STATUS_COLORS: Record<ListingStatus, string> = {
  available: '#4caf50',
  negotiating: '#ff9800',
  reserved: '#2196f3',
  sold: '#8890b0',
};

function fmtDate(seconds?: number): string {
  if (!seconds) return '—';
  const d = new Date(seconds * 1000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function MarketplaceAdmin() {
  const colors = useTheme();
  const font = useAppFont();
  const router = useRouter();
  const { showToast } = useUiStore();

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

  function confirmDelete(listing: MarketplaceListing) {
    Alert.alert('Delete listing', `Remove “${listing.productName}”? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting((p) => ({ ...p, [listing.id]: true }));
          try {
            await deleteListing(listing.id, listing.imageUrl);
            showToast('Listing deleted', 'success');
          } catch {
            showToast('Failed to delete listing', 'error');
          } finally {
            setDeleting((p) => ({ ...p, [listing.id]: false }));
          }
        },
      },
    ]);
  }

  const filtered = filter === 'all' ? listings : listings.filter((l) => (l.status ?? 'available') === filter);

  return (
    <Screen scrollable={false}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header with back */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push('/admin/operations')} hitSlop={8} activeOpacity={0.7} style={styles.back}>
            <ChevronLeft size={26} color={colors.text} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={[styles.title, { ...font.bold, color: colors.text }]}>Marketplace</Text>
        </View>

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {FILTER_TABS.map((tab) => {
            const count = tab === 'all' ? listings.length : listings.filter((l) => (l.status ?? 'available') === tab).length;
            const active = filter === tab;
            return (
              <TouchableOpacity key={tab} style={[styles.tab, active && styles.tabActive]} onPress={() => setFilter(tab)} activeOpacity={0.7}>
                <Text style={[styles.tabText, { ...font.semiBold, color: active ? '#fff' : colors.textMuted }]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator size="large" color="#004aad" style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { ...font.regular, color: colors.textMuted }]}>No listings.</Text>
          </View>
        ) : (
          filtered.map((listing) => {
            const status = (listing.status ?? 'available') as ListingStatus;
            return (
              <View key={listing.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
                {listing.imageUrl ? (
                  <Image source={{ uri: listing.imageUrl }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty, { borderColor: colors.border }]} />
                )}
                <View style={styles.info}>
                  <Text style={[styles.name, { ...font.bold, color: colors.text }]} numberOfLines={1}>{listing.productName}</Text>
                  <Text style={[styles.meta, { ...font.regular, color: colors.textSec }]} numberOfLines={1}>
                    {listing.type === 'rental' ? 'Rental' : 'For sale'} · ₪{listing.price?.toLocaleString?.() ?? listing.price}
                  </Text>
                  <Text style={[styles.meta, { ...font.regular, color: colors.textMuted }]} numberOfLines={1}>
                    {listing.posterName} · {listing.location} · {fmtDate(listing.createdAt?.seconds)}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: STATUS_COLORS[status] + '22' }]}>
                    <Text style={[styles.badgeText, { ...font.semiBold, color: STATUS_COLORS[status] }]}>{status}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => confirmDelete(listing)}
                  disabled={!!deleting[listing.id]}
                  activeOpacity={0.7}
                >
                  {deleting[listing.id] ? <ActivityIndicator size="small" color="#ef4444" /> : <Trash2 size={18} color="#ef4444" strokeWidth={2} />}
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  back: { padding: 2 },
  title: { fontSize: 28 },
  tabRow: { gap: 8, marginBottom: 16 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(0,74,173,0.08)' },
  tabActive: { backgroundColor: '#004aad' },
  tabText: { fontSize: 13 },
  empty: { alignItems: 'center', marginTop: 40 },
  emptyText: { fontSize: 15 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  thumbEmpty: { borderWidth: 1 },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 15 },
  meta: { fontSize: 12 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 2 },
  badgeText: { fontSize: 11, textTransform: 'capitalize' },
  deleteBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

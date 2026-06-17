import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Image, Platform, ScrollView,
} from 'react-native';
import { useUiStore } from '@core/stores/uiStore';
import type { MarketplaceListing } from '../types';

type Props = {
  listing: MarketplaceListing | null;
  onClose: () => void;
};

export function ListingDetailModal({ listing, onClose }: Props) {
  const { showToast } = useUiStore();

  if (!listing) return null;

  const priceLabel = listing.type === 'rental'
    ? `₪${listing.price.toLocaleString()}/day`
    : `₪${listing.price.toLocaleString()}`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, Platform.OS === 'web' && (webSheet as any)]}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.imageWrap}>
            {listing.imageUrl ? (
              <Image source={{ uri: listing.imageUrl }} style={styles.image} resizeMode="cover" />
            ) : (
              <Text style={styles.imagePlaceholder}>📦</Text>
            )}
          </View>
          <Text style={styles.name}>{listing.productName}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.price}>{priceLabel}</Text>
            <Text style={styles.location}>📍 {listing.location}</Text>
          </View>
          <Text style={styles.poster}>
            Posted by <Text style={styles.posterName}>{listing.posterName}</Text>
          </Text>
          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => showToast('Feature coming soon', 'info')}
            activeOpacity={0.8}
          >
            <Text style={styles.contactText}>Contact Seller</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const webSheet = {
  maxWidth: 540,
  alignSelf: 'center',
  width: '100%',
  borderRadius: 20,
  bottom: 'auto',
  top: '50%',
  transform: [{ translateY: -50 }],
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0f0f1f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#ffffff18',
    padding: 20,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: '#ffffff33',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  imageWrap: {
    height: 160,
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 16,
  },
  image: { width: '100%', height: 160 },
  imagePlaceholder: { fontSize: 52 },
  name: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 },
  price: { fontSize: 18, fontWeight: '700', color: '#cb6ce6' },
  location: { fontSize: 14, color: 'rgba(255,255,255,0.5)' },
  poster: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 },
  posterName: { color: '#cb6ce6', fontWeight: '600' },
  contactBtn: {
    backgroundColor: '#cb6ce6',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  contactText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

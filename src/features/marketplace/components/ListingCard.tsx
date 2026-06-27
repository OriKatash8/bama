import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import type { MarketplaceListing } from '../types';
import { useTheme } from '@core/hooks/useTheme';

const CONDITION_LABEL: Record<string, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
};

const CONDITION_COLOR: Record<string, string> = {
  new: '#43a047',
  like_new: '#00897b',
  good: '#fb8c00',
  fair: '#e53935',
};

type Props = {
  listing: MarketplaceListing;
  onPress: () => void;
};

export function ListingCard({ listing, onPress }: Props) {
  const colors = useTheme();
  const isRental = listing.type === 'rental';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.imageWrap}>
        {listing.imageUrl ? (
          <Image source={{ uri: listing.imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.cardAlt }]}>
            <Text style={styles.placeholderIcon}>{isRental ? '🎬' : '📦'}</Text>
          </View>
        )}
        {listing.condition && (
          <View style={[styles.conditionBadge, { backgroundColor: CONDITION_COLOR[listing.condition] ?? '#888' }]}>
            <Text style={styles.conditionText}>{CONDITION_LABEL[listing.condition]}</Text>
          </View>
        )}
        {isRental && (
          <View style={styles.rentalBadge}>
            <Text style={styles.rentalBadgeText}>Rental</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>{listing.productName}</Text>
        {listing.brand && (
          <Text style={[styles.brand, { color: colors.textMuted }]} numberOfLines={1}>{listing.brand}</Text>
        )}
        <Text style={styles.price}>
          ₪{listing.price.toLocaleString()}{isRental ? '/day' : ''}
        </Text>
        <Text style={[styles.location, { color: colors.textMuted }]} numberOfLines={1}>📍 {listing.location}</Text>
        <Text style={[styles.seller, { color: colors.textMuted }]} numberOfLines={1}>by {listing.posterName}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  imageWrap: { width: '100%', height: 140, position: 'relative' },
  image: { width: '100%', height: 140 },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholderIcon: { fontSize: 40 },
  conditionBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  conditionText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  rentalBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: '#cb6ce6',
  },
  rentalBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  body: { padding: 10, gap: 3 },
  name: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  brand: { fontSize: 11 },
  price: { fontSize: 15, fontWeight: '800', color: '#004aad', marginTop: 2 },
  location: { fontSize: 11 },
  seller: { fontSize: 11 },
});

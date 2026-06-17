import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import type { MarketplaceListing } from '../types';

type Props = {
  listing: MarketplaceListing;
  onPress: () => void;
};

export function ListingCard({ listing, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.thumb}>
        {listing.imageUrl ? (
          <Image source={{ uri: listing.imageUrl }} style={styles.image} />
        ) : (
          <Text style={styles.placeholder}>📦</Text>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{listing.productName}</Text>
        <Text style={styles.location}>📍 {listing.location}</Text>
      </View>
      <Text style={styles.price}>₪{listing.price.toLocaleString()}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 16,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: '#ffffff12',
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  image: { width: 44, height: 44 },
  placeholder: { fontSize: 22 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 3 },
  location: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  price: { fontSize: 15, fontWeight: '700', color: '#cb6ce6' },
});

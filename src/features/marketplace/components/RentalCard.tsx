import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import type { MarketplaceListing } from '../types';

type Props = {
  listing: MarketplaceListing;
  onPress: () => void;
};

export function RentalCard({ listing, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imageWrap}>
        {listing.imageUrl ? (
          <Image source={{ uri: listing.imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <Text style={styles.placeholder}>🎬</Text>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{listing.productName}</Text>
        <Text style={styles.price}>₪{listing.price.toLocaleString()}/day</Text>
        <Text style={styles.location}>📍 {listing.location}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    overflow: 'hidden',
    margin: 5,
    borderWidth: 1,
    borderColor: '#ffffff12',
  },
  imageWrap: {
    height: 120,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: 120 },
  placeholder: { fontSize: 36 },
  body: { padding: 8, gap: 2 },
  name: { fontSize: 13, fontWeight: '700', color: '#fff' },
  price: { fontSize: 13, fontWeight: '700', color: '#cb6ce6' },
  location: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },
});

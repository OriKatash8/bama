import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { ListingCard } from './ListingCard';
import { useMarketplaceListings } from '../hooks/useMarketplaceListings';
import type { MarketplaceListing } from '../types';

type Props = {
  searchQuery: string;
  onSelectListing: (listing: MarketplaceListing) => void;
};

export function SecondHandList({ searchQuery, onSelectListing }: Props) {
  const { listings, isLoading } = useMarketplaceListings('secondhand');

  const filtered = listings.filter((l) =>
    l.productName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#cb6ce6" />
      </View>
    );
  }

  if (filtered.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>🏷️</Text>
        <Text style={styles.emptyText}>No listings found</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ListingCard listing={item} onPress={() => onSelectListing(item)} />
      )}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyText: { fontSize: 15, color: 'rgba(255,255,255,0.5)' },
  list: { paddingVertical: 8, paddingBottom: 100 },
});

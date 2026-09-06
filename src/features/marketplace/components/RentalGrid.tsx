import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { RentalCard } from './RentalCard';
import { useMarketplaceListings } from '../hooks/useMarketplaceListings';
import type { MarketplaceListing } from '../types';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

type Props = {
  searchQuery: string;
  onSelectListing: (listing: MarketplaceListing) => void;
};

export function RentalGrid({ searchQuery, onSelectListing }: Props) {
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const { listings, isLoading } = useMarketplaceListings('rental');

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
        <Text style={styles.emptyIcon}>🎬</Text>
        <Text style={styles.emptyText}>{t('marketplace.no_listings')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      numColumns={2}
      renderItem={({ item }) => (
        <RentalCard listing={item} onPress={() => onSelectListing(item)} />
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
  list: { padding: 11, paddingBottom: 100 },
});

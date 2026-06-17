import { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Screen } from '@components/layout/Screen';
import { MarketplaceToggle } from '@features/marketplace/components/MarketplaceToggle';
import { SecondHandList } from '@features/marketplace/components/SecondHandList';
import { RentalGrid } from '@features/marketplace/components/RentalGrid';
import { ListingDetailModal } from '@features/marketplace/components/ListingDetailModal';
import { PostListingSheet } from '@features/marketplace/components/PostListingSheet';
import type { MarketplaceListing, MarketplaceListingType } from '@features/marketplace/types';

export default function MarketplaceScreen() {
  const [activeTab, setActiveTab] = useState<MarketplaceListingType>('secondhand');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [postSheetVisible, setPostSheetVisible] = useState(false);

  return (
    <Screen scrollable={false} backgroundColor="#0f0f1f">
      <View style={styles.header}>
        <TextInput
          style={styles.searchBar}
          placeholder="Search equipment..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <MarketplaceToggle active={activeTab} onChange={setActiveTab} />
      </View>

      <View style={styles.content}>
        {activeTab === 'secondhand' ? (
          <SecondHandList searchQuery={searchQuery} onSelectListing={setSelectedListing} />
        ) : (
          <RentalGrid searchQuery={searchQuery} onSelectListing={setSelectedListing} />
        )}
      </View>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setPostSheetVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <ListingDetailModal
        listing={selectedListing}
        onClose={() => setSelectedListing(null)}
      />
      <PostListingSheet
        visible={postSheetVisible}
        initialType={activeTab}
        onClose={() => setPostSheetVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  searchBar: {
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#ffffff12',
  },
  content: { flex: 1 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#cb6ce6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#cb6ce6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },
});

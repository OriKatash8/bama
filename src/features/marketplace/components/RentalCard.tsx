import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@components/ui/AppText';

const LOCATION_ICON = require('../../../../assets/images/location-icon.png');
import type { MarketplaceListing } from '../types';
import { useSettingsStore } from '@core/stores/settingsStore';

type Props = {
  listing: MarketplaceListing;
  onPress: () => void;
};

export function RentalCard({ listing, onPress }: Props) {
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imageWrap}>
        {listing.imageUrl ? (
          <Image source={{ uri: listing.imageUrl }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <Text style={styles.placeholder}>🎬</Text>
        )}
      </View>
      <View style={styles.body}>
        <AppText weight="bold" style={styles.name} numberOfLines={2}>{listing.productName}</AppText>
        <Text style={styles.price}>₪{listing.price.toLocaleString()}/day</Text>
        <View style={[styles.locationRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <Image
            source={LOCATION_ICON}
            style={[styles.locationIcon, { marginRight: rtl ? 0 : 4, marginLeft: rtl ? 4 : 0 }]}
            contentFit="contain" cachePolicy="memory-disk"
          />
          <AppText style={styles.location} numberOfLines={1}>{listing.location}</AppText>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    margin: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  imageWrap: {
    height: 120,
    backgroundColor: '#f0f0f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: 120 },
  placeholder: { fontSize: 36 },
  body: { padding: 8, gap: 2 },
  name: { fontSize: 13, fontWeight: '700', color: '#004aad' },
  price: { fontSize: 13, fontWeight: '700', color: '#cb6ce6' },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  locationIcon: { width: 14, height: 14 },
  location: { fontSize: 11, color: 'rgba(0,74,173,0.5)', flex: 1 },
});

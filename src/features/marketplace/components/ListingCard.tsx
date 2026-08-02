import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

const LOCATION_ICON = require('../../../../assets/images/location-icon.png');
import type { MarketplaceListing } from '../types';
import { useTheme } from '@core/hooks/useTheme';
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
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const isRental = listing.type === 'rental';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.imageWrap}>
        {listing.imageUrl ? (
          <Image source={{ uri: listing.imageUrl }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.cardAlt }]}>
            <Text style={styles.placeholderIcon}>{isRental ? '🎬' : '📦'}</Text>
          </View>
        )}
        {listing.condition && (
          <View style={[styles.conditionBadge, { backgroundColor: CONDITION_COLOR[listing.condition] ?? '#888' }]}>
            <Text style={styles.conditionText}>
              {t(`marketplace.condition_${listing.condition}`)}
            </Text>
          </View>
        )}
        {isRental && (
          <View style={styles.rentalBadge}>
            <Text style={styles.rentalBadgeText}>{t('marketplace.rental_badge')}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
          {listing.productName}
        </Text>
        {listing.brand && (
          <Text style={[styles.brand, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
            {listing.brand}
          </Text>
        )}
        <Text style={[styles.price, { textAlign: rtl ? 'right' : 'left' }]}>
          ₪{listing.price.toLocaleString()}{isRental ? t('marketplace.per_day') : ''}
        </Text>
        <View style={[styles.locationRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <Image
            source={LOCATION_ICON}
            style={[styles.locationIcon, { marginRight: rtl ? 0 : 4, marginLeft: rtl ? 4 : 0 }]}
            contentFit="contain" cachePolicy="memory-disk"
          />
          <Text style={[styles.location, { color: colors.textMuted }]} numberOfLines={1}>
            {listing.location}
          </Text>
        </View>
        <Text style={[styles.seller, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
          {t('marketplace.by')} {listing.posterName}
        </Text>
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
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  locationIcon: { width: 14, height: 14 },
  location: { fontSize: 11, flex: 1 },
  seller: { fontSize: 11 },
});

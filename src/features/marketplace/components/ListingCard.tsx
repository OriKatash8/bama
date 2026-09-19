import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@components/ui/AppText';

const LOCATION_ICON = require('../../../../assets/images/location-icon.png');
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

// Same four hues as before, darkened so white 10pt text reads on them.
const CONDITION_COLOR: Record<string, string> = {
  new: '#2F7A45',
  like_new: '#2A7C86',
  good: '#C2751A',
  fair: '#B4232A',
};

type Props = {
  listing: MarketplaceListing;
  onPress: () => void;
};

export function ListingCard({ listing, onPress }: Props) {
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const isRental = listing.type === 'rental';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.imageWrap}>
        {listing.imageUrl ? (
          <Image source={{ uri: listing.imageUrl }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderIcon}>{isRental ? '🎬' : '📦'}</Text>
          </View>
        )}
        {listing.condition && (
          <View style={[styles.conditionBadge, { backgroundColor: CONDITION_COLOR[listing.condition] ?? '#888' }]}>
            <AppText weight="bold" style={styles.conditionText}>
              {t(`marketplace.condition_${listing.condition}`)}
            </AppText>
          </View>
        )}
        {isRental && (
          <View style={styles.rentalBadge}>
            <AppText weight="bold" style={styles.rentalBadgeText}>{t('marketplace.rental_badge')}</AppText>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <AppText weight="bold" style={[styles.name, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1} ellipsizeMode="tail">
          {listing.productName}
        </AppText>
        {listing.brand && (
          <AppText style={[styles.meta, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1} ellipsizeMode="tail">
            {listing.brand}
          </AppText>
        )}
        {/* Location and seller share one line, joined by a middle dot. The
            strings are the existing ones; only the layout merged. */}
        <View style={[styles.locationRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <Image
            source={LOCATION_ICON}
            style={[styles.locationIcon, { marginRight: rtl ? 0 : 4, marginLeft: rtl ? 4 : 0 }]}
            contentFit="contain" cachePolicy="memory-disk"
          />
          {/* textAlign is required: this line is flex:1, so without it the value
              renders at the box's LTR start — the far side from its icon in
              Hebrew. */}
          <AppText
            style={[styles.meta, styles.metaFlex, { textAlign: rtl ? 'right' : 'left' }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {[listing.location, `${t('marketplace.by')} ${listing.posterName}`].filter(Boolean).join(' · ')}
          </AppText>
        </View>
        <Text style={[styles.price, { textAlign: rtl ? 'right' : 'left' }]}>
          ₪{listing.price.toLocaleString()}{isRental ? t('marketplace.per_day') : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFEDF5',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#4C1D95',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  imageWrap: { width: '100%', height: 112, position: 'relative' },
  image: { width: '100%', height: 112 },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3EEFE' },
  placeholderIcon: { fontSize: 36 },
  // Positions unchanged: condition top-left, rental top-right.
  conditionBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  conditionText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  rentalBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    backgroundColor: '#F3EEFE',
  },
  rentalBadgeText: { color: '#6D28D9', fontSize: 10, fontWeight: '700' },
  body: { paddingTop: 10, paddingHorizontal: 11, paddingBottom: 12, gap: 3 },
  name: { fontSize: 13.5, fontWeight: '700', lineHeight: 18, color: '#1A1626' },
  meta: { fontSize: 11, color: '#9C99AD' },
  metaFlex: { flex: 1 },
  price: { fontSize: 16, fontWeight: '800', color: '#4C1D95', letterSpacing: -0.2, marginTop: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  locationIcon: { width: 14, height: 14 },
});

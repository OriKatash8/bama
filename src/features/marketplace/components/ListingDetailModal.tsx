import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, useWindowDimensions,
} from 'react-native';
import { AppText } from '@components/ui/AppText';
import { Image } from 'expo-image';

const LOCATION_ICON = require('../../../../assets/images/location-icon.png');
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import { useRouter, useSegments } from 'expo-router';
import { useUiStore } from '@core/stores/uiStore';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { startNegotiation } from '../services/marketplaceService';

const CONDITION_COLOR: Record<string, string> = {
  new: '#43a047',
  like_new: '#00897b',
  good: '#fb8c00',
  fair: '#e53935',
};
import type { MarketplaceListing } from '../types';
import { useState } from 'react';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    if (typeof result !== 'string') return key;
    if (!vars) return result;
    return result.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
  };
}

type Props = {
  listing: MarketplaceListing | null;
  onClose: () => void;
};

export function ListingDetailModal({ listing, onClose }: Props) {
  const { showToast } = useUiStore();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentUserName = useAuthStore((s) => s.user?.displayName) ?? '';
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];

  const [isBuying, setIsBuying] = useState(false);
  const { height: screenHeight } = useWindowDimensions();

  if (!listing) return null;

  const priceLabel = listing.type === 'rental'
    ? `₪${listing.price.toLocaleString()}${t('marketplace.per_day')}`
    : `₪${listing.price.toLocaleString()}`;

  const isOwnListing = currentUserId === listing.posterId;
  // Item stays on the market during discussion; only reserved/sold are unavailable.
  const isUnavailable = listing.status === 'reserved' || listing.status === 'sold';

  async function handleTalkWithSeller() {
    if (!currentUserId || !listing) return;
    const snap = listing;
    setIsBuying(true);
    try {
      const autoMessage = t('marketplace.talk_message', { title: snap.productName });
      const chatId = await startNegotiation(
        snap.id,
        currentUserId,
        currentUserName,
        snap.posterId,
        snap.productName,
        autoMessage,
      );
      onClose();
      router.push(`/${modeSegment}/(tabs)/chats/${chatId}` as never);
    } catch {
      Alert.alert(t('marketplace.buy_error'));
    } finally {
      setIsBuying(false);
    }
  }

  const rowDir: 'row' | 'row-reverse' = rtl ? 'row-reverse' : 'row';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        <LinearGradient
          colors={['#efd4f6', '#b7cae6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.card, { height: screenHeight * 0.82 }]}
        >
          {/* Header */}
          <View style={[styles.header, { flexDirection: rowDir }]}>
            <AppText
              weight="bold"
              style={[styles.headerTitle, { textAlign: rtl ? 'right' : 'left' }]}
              numberOfLines={2}
            >
              {listing.productName}
            </AppText>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color="#004aad" />
            </TouchableOpacity>
          </View>

          {/* Scrollable content */}
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Image */}
            <View style={styles.imageWrap}>
              {listing.imageUrl ? (
                <Image source={{ uri: listing.imageUrl }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <Text style={styles.imagePlaceholder}>📦</Text>
              )}
            </View>

            {/* Condition / Brand / Category */}
            {(listing.condition || listing.brand || listing.category) && (
              <View style={styles.detailsBox}>
                {listing.condition && (
                  <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                    <AppText weight="regular" style={styles.detailLabel}>
                      {t('marketplace.condition')}
                    </AppText>
                    <View style={[styles.conditionBadge, { backgroundColor: CONDITION_COLOR[listing.condition] ?? '#888' }]}>
                      <AppText weight="semiBold" style={styles.conditionText}>
                        {t(`marketplace.condition_${listing.condition}`)}
                      </AppText>
                    </View>
                  </View>
                )}
                {listing.brand && (
                  <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                    <AppText weight="regular" style={styles.detailLabel}>{t('marketplace.brand')}</AppText>
                    <AppText weight="semiBold" style={styles.detailValue}>{listing.brand}</AppText>
                  </View>
                )}
                {listing.category && (
                  <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                    <AppText weight="regular" style={styles.detailLabel}>{t('marketplace.category')}</AppText>
                    <AppText weight="semiBold" style={styles.detailValue}>
                      {t(`marketplace.category_${listing.category}`) || listing.category}
                      {listing.subcategory ? ` › ${listing.subcategory}` : ''}
                    </AppText>
                  </View>
                )}
              </View>
            )}

            {/* Price & location */}
            <View style={styles.infoBox}>
              <Text style={[styles.price, { textAlign: rtl ? 'right' : 'left' }]}>{priceLabel}</Text>
              <View style={[styles.locationRow, { flexDirection: rowDir }]}>
                <Image
                  source={LOCATION_ICON}
                  style={[styles.locationIcon, { marginRight: rtl ? 0 : 4, marginLeft: rtl ? 4 : 0 }]}
                  contentFit="contain" cachePolicy="memory-disk"
                />
                <AppText weight="regular" style={styles.location} numberOfLines={1}>{listing.location}</AppText>
              </View>
            </View>

            {/* Seller */}
            <View style={styles.sellerBox}>
              <AppText weight="regular" style={[styles.poster, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('marketplace.posted_by')}{' '}
                <AppText weight="semiBold" style={styles.posterName}>{listing.posterName}</AppText>
              </AppText>
            </View>
          </ScrollView>

          {/* Talk / In Discussion — pinned outside ScrollView */}
          {!isOwnListing && (
            isUnavailable ? (
              <View style={styles.reservedBtn}>
                <AppText weight="bold" style={styles.reservedText}>
                  {t('marketplace.in_discussion')}
                </AppText>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.buyBtn, isBuying && styles.buyBtnDisabled]}
                onPress={handleTalkWithSeller}
                activeOpacity={0.8}
                disabled={isBuying}
              >
                <AppText weight="bold" style={styles.buyText}>{t('marketplace.talk_with_seller')}</AppText>
              </TouchableOpacity>
            )
          )}
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    width: '90%',
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#004aad',
    paddingRight: 8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 8 },

  imageWrap: {
    height: 180,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.1)',
  },
  image: { width: '100%', height: 180 },
  imagePlaceholder: { fontSize: 52 },

  infoBox: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.1)',
  },
  price: { fontSize: 18, fontWeight: '700', color: '#004aad' },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  locationIcon: { width: 14, height: 14 },
  location: { fontSize: 14, color: '#004aad99', flex: 1 },

  detailsBox: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.1)',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 13,
    color: '#004aad99',
  },
  detailValue: {
    fontSize: 13,
    color: '#004aad',
    flexShrink: 1,
    textAlign: 'right',
  },
  conditionBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  conditionText: {
    color: '#fff',
    fontSize: 12,
  },

  sellerBox: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.1)',
  },
  poster: { fontSize: 13, color: '#004aad99' },
  posterName: { color: '#004aad', fontWeight: '600' },

  buyBtn: {
    backgroundColor: '#004aad',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  buyBtnDisabled: { opacity: 0.6 },
  buyText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  reservedBtn: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  reservedText: { color: '#004aad99', fontSize: 16, fontWeight: '700' },
});

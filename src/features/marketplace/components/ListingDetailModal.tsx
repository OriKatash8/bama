import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';

const LOCATION_ICON = require('../../../../assets/images/location-icon.png');
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import { useRouter, useSegments } from 'expo-router';
import { useUiStore } from '@core/stores/uiStore';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { confirmPurchase } from '../services/marketplaceService';
import { CheckoutModal } from './CheckoutModal';
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
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];

  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const { height: screenHeight } = useWindowDimensions();

  if (!listing) return null;

  const priceLabel = listing.type === 'rental'
    ? `₪${listing.price.toLocaleString()}${t('marketplace.per_day')}`
    : `₪${listing.price.toLocaleString()}`;

  const fee = Math.round(listing.price * 0.03);
  const isOwnListing = currentUserId === listing.posterId;
  const isUnavailable = listing.status === 'reserved' || listing.status === 'sold';

  async function handleConfirmPurchase() {
    if (!currentUserId || !listing) return;
    const snap = listing;
    setIsBuying(true);
    try {
      const autoMessage = t('marketplace.buy_message', {
        title: snap.productName,
        price: snap.price,
      });
      const chatId = await confirmPurchase(
        snap.id,
        currentUserId,
        snap.posterId,
        { productName: snap.productName, price: snap.price },
        autoMessage,
      );
      setCheckoutVisible(false);
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
          style={[styles.card, { maxHeight: screenHeight * 0.85 }]}
        >
          {/* Header */}
          <View style={[styles.header, { flexDirection: rowDir }]}>
            <Text
              style={[styles.headerTitle, { textAlign: rtl ? 'right' : 'left', ...font.bold }]}
              numberOfLines={2}
            >
              {listing.productName}
            </Text>
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

            {/* Price & location */}
            <View style={[styles.infoBox, { flexDirection: rowDir }]}>
              <Text style={[styles.price, { ...font.bold }]}>{priceLabel}</Text>
              <View style={[styles.locationRow, { flexDirection: rowDir }]}>
                <Image
                  source={LOCATION_ICON}
                  style={[styles.locationIcon, { marginRight: rtl ? 0 : 4, marginLeft: rtl ? 4 : 0 }]}
                  contentFit="contain" cachePolicy="memory-disk"
                />
                <Text style={[styles.location, { ...font.regular }]} numberOfLines={1}>{listing.location}</Text>
              </View>
            </View>

            {/* Seller */}
            <View style={styles.sellerBox}>
              <Text style={[styles.poster, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                {t('marketplace.posted_by')}{' '}
                <Text style={[styles.posterName, { ...font.semiBold }]}>{listing.posterName}</Text>
              </Text>
            </View>
          </ScrollView>

          {/* Buy / Reserved — pinned outside ScrollView */}
          {!isOwnListing && (
            isUnavailable ? (
              <View style={styles.reservedBtn}>
                <Text style={[styles.reservedText, { ...font.bold }]}>
                  {t('marketplace.reserved')}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.buyBtn}
                onPress={() => setCheckoutVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.buyText, { ...font.bold }]}>{t('marketplace.buy_button')}</Text>
              </TouchableOpacity>
            )
          )}
        </LinearGradient>
      </View>

      <CheckoutModal
        visible={checkoutVisible}
        productName={listing.productName}
        price={listing.price}
        platformFee={fee}
        isLoading={isBuying}
        onConfirm={handleConfirmPurchase}
        onCancel={() => setCheckoutVisible(false)}
      />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.1)',
  },
  price: { fontSize: 18, fontWeight: '700', color: '#004aad' },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  locationIcon: { width: 14, height: 14 },
  location: { fontSize: 14, color: '#004aad99', flex: 1 },

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

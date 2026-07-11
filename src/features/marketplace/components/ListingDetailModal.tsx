import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Image, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useUiStore } from '@core/stores/uiStore';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { buyListing } from '../services/marketplaceService';
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
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];

  const [isBuying, setIsBuying] = useState(false);

  if (!listing) return null;

  const priceLabel = listing.type === 'rental'
    ? `₪${listing.price.toLocaleString()}${t('marketplace.per_day')}`
    : `₪${listing.price.toLocaleString()}`;

  const fee = Math.round(listing.price * 0.03);
  const isOwnListing = currentUserId === listing.posterId;
  const isUnavailable = listing.status === 'reserved' || listing.status === 'sold';

  function handleBuyPress() {
    Alert.alert(
      t('marketplace.confirm_purchase_title'),
      t('marketplace.confirm_purchase_message', { fee }),
      [
        { text: t('marketplace.cancel'), style: 'cancel' },
        {
          text: t('marketplace.confirm'),
          onPress: confirmBuy,
        },
      ]
    );
  }

  async function confirmBuy() {
    if (!currentUserId) return;
    setIsBuying(true);
    try {
      const chatId = await buyListing(
        listing.id,
        currentUserId,
        listing.posterId,
        { productName: listing.productName, price: listing.price }
      );
      onClose();
      router.push(`/${modeSegment}/(tabs)/chats/${chatId}` as never);
    } catch {
      Alert.alert(t('marketplace.buy_error'));
    } finally {
      setIsBuying(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, Platform.OS === 'web' && (webSheet as object)]}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.imageWrap}>
            {listing.imageUrl ? (
              <Image source={{ uri: listing.imageUrl }} style={styles.image} resizeMode="cover" />
            ) : (
              <Text style={styles.imagePlaceholder}>📦</Text>
            )}
          </View>
          <Text style={[styles.name, { textAlign: rtl ? 'right' : 'left' }]}>{listing.productName}</Text>
          <View style={[styles.metaRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Text style={styles.price}>{priceLabel}</Text>
            <Text style={styles.location}>📍 {listing.location}</Text>
          </View>
          <Text style={[styles.poster, { textAlign: rtl ? 'right' : 'left' }]}>
            {t('marketplace.posted_by')} <Text style={styles.posterName}>{listing.posterName}</Text>
          </Text>

          {!isOwnListing && (
            isUnavailable ? (
              <View style={styles.reservedBtn}>
                <Text style={styles.reservedText}>{t('marketplace.reserved')}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.buyBtn, isBuying && styles.buyBtnDisabled]}
                onPress={handleBuyPress}
                disabled={isBuying}
                activeOpacity={0.8}
              >
                {isBuying
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.buyText}>{t('marketplace.buy_button')}</Text>}
              </TouchableOpacity>
            )
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const webSheet = {
  maxWidth: 540,
  alignSelf: 'center',
  width: '100%',
  borderRadius: 20,
  bottom: 'auto',
  top: '50%',
  transform: [{ translateY: -50 }],
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0f0f1f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#ffffff18',
    padding: 20,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: '#ffffff33',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  imageWrap: {
    height: 160,
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 16,
  },
  image: { width: '100%', height: 160 },
  imagePlaceholder: { fontSize: 52 },
  name: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 10 },
  metaRow: { alignItems: 'center', gap: 16, marginBottom: 8 },
  price: { fontSize: 18, fontWeight: '700', color: '#cb6ce6' },
  location: { fontSize: 14, color: 'rgba(255,255,255,0.5)' },
  poster: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 },
  posterName: { color: '#cb6ce6', fontWeight: '600' },
  buyBtn: {
    backgroundColor: '#cb6ce6',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buyBtnDisabled: { opacity: 0.6 },
  buyText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  reservedBtn: {
    backgroundColor: '#555',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  reservedText: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '700' },
});

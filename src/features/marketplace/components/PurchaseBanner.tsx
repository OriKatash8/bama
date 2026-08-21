import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { X } from 'lucide-react-native';
import { confirmDialog } from '@utils/confirmDialog';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import {
  listenToPurchaseContext,
  confirmReceived,
  cancelPurchase,
  markHandedOver,
  acceptDeal,
} from '../services/marketplaceService';
import type { MarketplaceListing } from '../types';
import type { Chat } from '@features/chat/types';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

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

type Props = { chatId: string; onDismiss?: () => void };

export function PurchaseBanner({ chatId, onDismiss }: Props) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  // Separate loading states so seller action can't disable buyer buttons and vice-versa
  const [buyerLoading, setBuyerLoading] = useState(false);
  const [sellerLoading, setSellerLoading] = useState(false);

  const currentUserId = useAuthStore((s) => s.user?.id) ?? '';
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();

  useEffect(() => {
    return listenToPurchaseContext(chatId, ({ chat, listing }) => {
      setChat(chat);
      setListing(listing);
    });
  }, [chatId]);

  // Only render inside a purchase chat that has a linked listing
  if (!chat || chat.type !== 'purchase' || !listing) return null;
  // A cancelled chat shows no banner
  if (chat.archived && chat.archiveReason === 'cancelled') return null;

  // Capture non-null references for async callbacks
  const snap = listing;

  // Seller is always the poster; buyer is the other chat member (works even
  // during the pending phase, before listing.buyerId is set).
  const seller = snap.posterId;
  const buyerId = chat.members.find((m) => m !== seller) ?? '';
  const isSeller = currentUserId === seller;
  const isBuyer = currentUserId === buyerId;

  const isAcceptedChat = snap.purchaseChatId === chatId;
  const isSuperseded = chat.archived === true && chat.archiveReason === 'superseded';

  // ── Derived phases (archived state wins over live listing status) ──────────
  const isCompleted = (snap.status === 'sold' && isAcceptedChat) ||
    (chat.archived === true && chat.archiveReason === 'completed');
  // "Not relevant": seller accepted another buyer for this item.
  const isReservedAnother = isSuperseded || (!isCompleted && snap.status !== 'available' && !isAcceptedChat);
  const isPending = !chat.archived && snap.status === 'available';
  const isAccepted = !chat.archived && snap.status === 'reserved' && isAcceptedChat;

  const rowDir = rtl ? 'row-reverse' : 'row' as const;

  // ── Seller: "Accept deal" ─────────────────────────────────────────────────
  async function handleAcceptDeal() {
    setSellerLoading(true);
    try {
      await acceptDeal(snap.id, chatId, buyerId, currentUserId, t('marketplace.deal_accepted_msg'));
    } finally {
      setSellerLoading(false);
    }
  }

  // ── Pending: seller "Decline" / buyer "Cancel" (does NOT touch listing) ───
  async function handleCancelNegotiation() {
    const confirmed = await confirmDialog(
      t('marketplace.confirm_cancel_title'),
      t('marketplace.confirm_cancel_msg'),
    );
    if (!confirmed) return;
    setBuyerLoading(true);
    setSellerLoading(true);
    try {
      await cancelPurchase(snap.id, chatId, currentUserId, t('marketplace.purchase_cancelled'), false);
    } finally {
      setBuyerLoading(false);
      setSellerLoading(false);
    }
  }

  // ── Buyer: "I received it — Done" ────────────────────────────────────────
  async function handleMarkReceived() {
    const confirmed = await confirmDialog(
      t('marketplace.confirm_received_title'),
      t('marketplace.confirm_received_msg'),
    );
    if (!confirmed) return;
    setBuyerLoading(true);
    try {
      await confirmReceived(
        snap.id,
        chatId,
        currentUserId,
        t('marketplace.sale_complete'),
        snap.sellerConfirmed ?? false,
      );
      Alert.alert(t('marketplace.fee_charged'));
    } catch (err) {
      console.error('[PurchaseBanner] confirmReceived error:', err);
    } finally {
      setBuyerLoading(false);
    }
  }

  // ── Buyer: "Cancel purchase" (accepted phase — returns item to market) ────
  async function handleCancelPurchase() {
    const confirmed = await confirmDialog(
      t('marketplace.confirm_cancel_title'),
      t('marketplace.confirm_cancel_msg'),
    );
    if (!confirmed) return;
    setBuyerLoading(true);
    try {
      await cancelPurchase(
        snap.id,
        chatId,
        currentUserId,
        t('marketplace.purchase_cancelled'),
        isAcceptedChat,
      );
    } catch (err) {
      console.error('[PurchaseBanner] cancelPurchase error:', err);
    } finally {
      setBuyerLoading(false);
    }
  }

  // ── Seller: "I handed it over" ────────────────────────────────────────────
  async function handleMarkHandedOver() {
    setSellerLoading(true);
    try {
      await markHandedOver(
        snap.id,
        chatId,
        currentUserId,
        t('marketplace.sale_complete'),
        snap.buyerConfirmed ?? false,
      );
    } finally {
      setSellerLoading(false);
    }
  }

  return (
    <View style={styles.banner}>
      {/* Status header */}
      <View style={[styles.bannerHeader, { flexDirection: rowDir }]}>
        <Text style={[styles.bannerTitle, { ...font.semiBold, textAlign: rtl ? 'right' : 'left', flex: 1 }]}>
          {isCompleted
            ? t('marketplace.sale_completed_label')
            : isReservedAnother
            ? t('marketplace.reserved_another_label')
            : isPending
            ? t('marketplace.negotiating_label')
            : t('marketplace.purchase_active_label')}
        </Text>
        {!isCompleted && !isReservedAnother && (
          <View style={[styles.statusBadge, styles.badgeReserved]}>
            <Text style={[styles.statusText, { ...font.semiBold }]}>⏳</Text>
          </View>
        )}
        {(isCompleted || isReservedAnother) && onDismiss && (
          <TouchableOpacity onPress={onDismiss} hitSlop={8} activeOpacity={0.7} style={styles.dismissBtn}>
            <X size={16} color="#004aad99" strokeWidth={2.5} />
          </TouchableOpacity>
        )}
      </View>

      {/* Product + price */}
      <View style={{ gap: 2 }}>
        <Text style={[styles.productName, { ...font.bold, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
          {snap.productName}
        </Text>
        <View style={[styles.priceRow, { flexDirection: rowDir }]}>
          <Text style={[styles.priceLabel, { ...font.regular }]}>
            ₪{snap.price.toLocaleString()}
          </Text>
          {snap.platformFee != null && (
            <Text style={[styles.feeLabel, { ...font.regular }]}>
              {' · '}{t('marketplace.platform_fee')}: ₪{snap.platformFee}
            </Text>
          )}
        </View>
      </View>

      {/* ── RESERVED FOR ANOTHER BUYER ─────────────────────────────────────── */}
      {isReservedAnother && (
        <View style={styles.sellerRow}>
          <Text style={[styles.waitingText, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}>
            {t('marketplace.reserved_another_msg')}
          </Text>
        </View>
      )}

      {/* ── PENDING phase ──────────────────────────────────────────────────── */}
      {isPending && isBuyer && (
        <View style={[styles.btnRow, { flexDirection: rowDir }]}>
          <TouchableOpacity
            style={[styles.secondaryBtn, { flex: 1 }, buyerLoading && styles.disabledBtn]}
            onPress={handleCancelNegotiation}
            disabled={buyerLoading}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryBtnText, { ...font.semiBold }]}>
              {t('marketplace.cancel_purchase')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isPending && isSeller && (
        <View style={[styles.btnRow, { flexDirection: rowDir }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, { flex: 2 }, sellerLoading && styles.disabledBtn]}
            onPress={handleAcceptDeal}
            disabled={sellerLoading}
            activeOpacity={0.8}
          >
            {sellerLoading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={[styles.primaryBtnText, { ...font.bold }]}>
                  {t('marketplace.accept_deal')}
                </Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { flex: 1 }, sellerLoading && styles.disabledBtn]}
            onPress={handleCancelNegotiation}
            disabled={sellerLoading}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryBtnText, { ...font.semiBold }]}>
              {t('marketplace.decline_deal')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── ACCEPTED phase — BUYER buttons ─────────────────────────────────── */}
      {isAccepted && isBuyer && (
        snap.buyerConfirmed && !snap.sellerConfirmed ? (
          <View style={styles.sellerRow}>
            <Text style={[styles.waitingText, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}>
              {t('marketplace.waiting_seller')}
            </Text>
          </View>
        ) : (
          <View style={[styles.btnRow, { flexDirection: rowDir }]}>
            <TouchableOpacity
              style={[styles.primaryBtn, buyerLoading && styles.disabledBtn]}
              onPress={handleMarkReceived}
              disabled={buyerLoading}
              activeOpacity={0.8}
            >
              {buyerLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[styles.primaryBtnText, { ...font.bold }]}>
                    {t('marketplace.mark_received')}
                  </Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, buyerLoading && styles.disabledBtn]}
              onPress={handleCancelPurchase}
              disabled={buyerLoading}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryBtnText, { ...font.semiBold }]}>
                {t('marketplace.cancel_purchase')}
              </Text>
            </TouchableOpacity>
          </View>
        )
      )}

      {/* ── ACCEPTED phase — SELLER button ─────────────────────────────────── */}
      {isAccepted && isSeller && (
        <View style={styles.sellerRow}>
          {snap.sellerConfirmed ? (
            <Text style={[styles.waitingText, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}>
              {t('marketplace.waiting_buyer')}
            </Text>
          ) : (
            <TouchableOpacity
              style={[styles.sellerBtn, sellerLoading && styles.disabledBtn]}
              onPress={handleMarkHandedOver}
              disabled={sellerLoading}
              activeOpacity={0.8}
            >
              {sellerLoading
                ? <ActivityIndicator color="#004aad" size="small" />
                : <Text style={[styles.sellerBtnText, { ...font.semiBold }]}>
                    {t('marketplace.mark_handed')}
                  </Text>}
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerTitle: {
    fontSize: 13,
    color: '#004aad99',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeReserved: { backgroundColor: '#fff3cd' },
  badgeSold:     { backgroundColor: '#d4edda' },
  statusText: { fontSize: 12 },
  productName: {
    fontSize: 16,
    color: '#004aad',
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 14,
    color: '#004aad',
  },
  feeLabel: {
    fontSize: 12,
    color: '#004aad99',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtn: {
    flex: 2,
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#555',
    fontSize: 13,
    fontWeight: '600',
  },
  sellerRow: {},
  sellerBtn: {
    borderWidth: 1.5,
    borderColor: '#004aad',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sellerBtnText: {
    color: '#004aad',
    fontSize: 14,
    fontWeight: '600',
  },
  waitingText: {
    fontSize: 13,
    color: '#004aad99',
    fontStyle: 'italic',
  },
  disabledBtn: { opacity: 0.5 },
  dismissBtn: { padding: 4, marginLeft: 4 },
});

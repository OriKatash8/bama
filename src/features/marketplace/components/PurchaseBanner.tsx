import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
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
  agreeToDeal,
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
  const currentUserName = useAuthStore((s) => s.user?.displayName) ?? '';
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

  // Mutual agreement (pending phase): the item leaves the market only once BOTH
  // sides have agreed. Tracked per-chat so multiple buyers can negotiate at once.
  const iAgreed = isSeller ? (chat.sellerAgreed ?? false) : (chat.buyerAgreed ?? false);
  const otherAgreed = isSeller ? (chat.buyerAgreed ?? false) : (chat.sellerAgreed ?? false);

  const rowDir = rtl ? 'row-reverse' : 'row' as const;

  // ── Agree to the deal (symmetric for seller & buyer) ──────────────────────
  async function handleAgree() {
    setBuyerLoading(true);
    setSellerLoading(true);
    try {
      if (otherAgreed) {
        // Second agreement — finalize: reserve the item and supersede other chats.
        await acceptDeal(snap.id, chatId, buyerId, currentUserId, t('marketplace.deal_accepted_msg'));
      } else {
        // First agreement — record my flag; item stays on the market.
        await agreeToDeal(
          chatId,
          isSeller ? 'sellerAgreed' : 'buyerAgreed',
          currentUserId,
          t(isSeller ? 'marketplace.seller_agreed_msg' : 'marketplace.buyer_agreed_msg'),
        );
      }
    } finally {
      setBuyerLoading(false);
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
      await cancelPurchase(snap.id, chatId, currentUserId, t('marketplace.purchase_cancelled'), false, snap.productName, currentUserName);
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
        snap.productName,
        currentUserName,
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
      {/* Status header — only the button-less terminal states keep a short label */}
      {(isCompleted || isReservedAnother) && (
        <View style={[styles.bannerHeader, { flexDirection: rowDir }]}>
          <Text style={[styles.bannerTitle, { ...font.semiBold, textAlign: rtl ? 'right' : 'left', flex: 1 }]}>
            {isCompleted
              ? t('marketplace.sale_completed_label')
              : t('marketplace.reserved_another_label')}
          </Text>
          {onDismiss && (
            <TouchableOpacity onPress={onDismiss} hitSlop={8} activeOpacity={0.7} style={styles.dismissBtn}>
              <X size={16} color="#004aad99" strokeWidth={2.5} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── PENDING phase — mutual agreement (symmetric for both sides) ─────── */}
      {isPending && (isBuyer || isSeller) && (
        iAgreed ? (
          <View style={styles.sellerRow}>
            <Text style={[styles.waitingText, { ...font.regular, textAlign: rtl ? 'right' : 'left', marginBottom: 8 }]}>
              {t('marketplace.waiting_agreement')}
            </Text>
            <View style={[styles.btnRow, { flexDirection: rowDir }]}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { flex: 1 }, (buyerLoading || sellerLoading) && styles.disabledBtn]}
                onPress={handleCancelNegotiation}
                disabled={buyerLoading || sellerLoading}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryBtnText, { ...font.semiBold }]}>
                  {t('marketplace.cancel_purchase')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.btnRow, { flexDirection: rowDir }]}>
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 2 }, (buyerLoading || sellerLoading) && styles.disabledBtn]}
              onPress={handleAgree}
              disabled={buyerLoading || sellerLoading}
              activeOpacity={0.8}
            >
              {(buyerLoading || sellerLoading)
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[styles.primaryBtnText, { ...font.bold }]}>
                    {t('marketplace.agree_deal')}
                  </Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { flex: 1 }, (buyerLoading || sellerLoading) && styles.disabledBtn]}
              onPress={handleCancelNegotiation}
              disabled={buyerLoading || sellerLoading}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryBtnText, { ...font.semiBold }]}>
                {isSeller ? t('marketplace.decline_deal') : t('marketplace.cancel_purchase')}
              </Text>
            </TouchableOpacity>
          </View>
        )
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

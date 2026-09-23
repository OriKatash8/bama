import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { AppText } from '@components/ui/AppText';
import { Image } from 'expo-image';

const LOCATION_ICON = require('../../../../assets/images/location-icon.png');
import { X } from 'lucide-react-native';
import { useRouter, useSegments } from 'expo-router';
import { useUiStore } from '@core/stores/uiStore';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { startNegotiation, shareListingToCommunities, deleteListing } from '../services/marketplaceService';
import { queryDocuments, where } from '@core/firebase/firestore';
import { confirmDialog } from '@utils/confirmDialog';
import type { Chat } from '@features/chat/types';

const CONDITION_COLOR: Record<string, string> = {
  new: '#43a047',
  like_new: '#00897b',
  good: '#fb8c00',
  fair: '#e53935',
};
import type { MarketplaceListing } from '../types';
import { useState, useRef } from 'react';

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
  onEdit?: (listing: MarketplaceListing) => void;
  /** When true, hides all marketplace action buttons (share/edit/delete/talk/buy)
   * so the modal reads as a read-only product notice — used inside purchase chats. */
  readOnly?: boolean;
};

export function ListingDetailModal({ listing, onClose, onEdit, readOnly }: Props) {
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

  // Share-to-communities picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [communities, setCommunities] = useState<Chat[]>([]);
  const [loadingCommunities, setLoadingCommunities] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [justShared, setJustShared] = useState<string[]>([]);
  const isSharingRef = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete(target: MarketplaceListing) {
    const ok = await confirmDialog(
      t('marketplace.delete_confirm_title'),
      t('marketplace.delete_confirm_body'),
    );
    if (!ok) return;
    setIsDeleting(true);
    try {
      await deleteListing(target.id, target.imageUrl);
      showToast(t('marketplace.listing_deleted'), 'success');
      onClose();
    } catch {
      showToast(t('marketplace.failed_delete'), 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  if (!listing) return null;

  const priceLabel = listing.type === 'rental'
    ? `₪${listing.price.toLocaleString()}${t('marketplace.per_day')}`
    : `₪${listing.price.toLocaleString()}`;

  const isOwnListing = currentUserId === listing.posterId;
  // Item stays on the market during discussion; only reserved/sold are unavailable.
  const isUnavailable = listing.status === 'reserved' || listing.status === 'sold';

  const alreadyShared = new Set([...(listing.sharedTo ?? []), ...justShared]);

  async function openPicker() {
    if (!currentUserId) return;
    setPickerOpen(true);
    setSelected(new Set());
    setLoadingCommunities(true);
    try {
      const list = await queryDocuments<Chat>(
        'chats',
        where('type', '==', 'community'),
        where('members', 'array-contains', currentUserId),
      );
      setCommunities(list);
    } catch {
      setCommunities([]);
    } finally {
      setLoadingCommunities(false);
    }
  }

  function toggleCommunity(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleShare() {
    const ids = [...selected];
    if (ids.length === 0 || !currentUserId || !listing) return;
    if (isSharingRef.current) return; // synchronous guard against a double-fire
    isSharingRef.current = true;
    setSharing(true);
    try {
      await shareListingToCommunities(listing, ids, { id: currentUserId, name: currentUserName });
      setJustShared((prev) => [...prev, ...ids]);
      setSelected(new Set());
      showToast(t('marketplace.share_success', { count: ids.length }), 'success');
      setPickerOpen(false);
    } catch {
      showToast(t('marketplace.share_error'), 'error');
    } finally {
      setSharing(false);
      isSharingRef.current = false;
    }
  }

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
      router.push(`/${modeSegment}/chat/${chatId}` as never);
    } catch {
      Alert.alert(t('marketplace.buy_error'));
    } finally {
      setIsBuying(false);
    }
  }

  const rowDir: 'row' | 'row-reverse' = rtl ? 'row-reverse' : 'row';

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => (pickerOpen ? setPickerOpen(false) : onClose())}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        <View testID="listing-card" style={styles.card}>
          {/* Header */}
          {/* Just the close button: the name is in the box under the picture.
              Pushed to the same end as before (left in Hebrew, right in English). */}
          <View style={[styles.header, { flexDirection: rowDir, justifyContent: 'flex-end' }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7} testID="listing-close">
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
            <View style={styles.imageWrap} testID="listing-image">
              {listing.imageUrl ? (
                <Image source={{ uri: listing.imageUrl }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <Text style={styles.imagePlaceholder}>📦</Text>
              )}
            </View>

            {/* Product name, right under the picture */}
            <View style={styles.detailsBox} testID="listing-name-box">
              <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                <AppText weight="regular" style={styles.detailLabel}>
                  {`${t('marketplace.product_name')}:`}
                </AppText>
                <AppText weight="semiBold" style={[styles.detailValue, { textAlign: rtl ? 'left' : 'right' }]}>
                  {listing.productName}
                </AppText>
              </View>
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
                    <AppText weight="semiBold" style={[styles.detailValue, { textAlign: rtl ? 'left' : 'right' }]}>{listing.brand}</AppText>
                  </View>
                )}
                {listing.category && (
                  <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                    <AppText weight="regular" style={styles.detailLabel}>{t('marketplace.category')}</AppText>
                    <AppText weight="semiBold" style={[styles.detailValue, { textAlign: rtl ? 'left' : 'right' }]}>
                      {t(`marketplace.category_${listing.category}`) || listing.category}
                      {(() => {
                        const subs = Array.isArray(listing.subcategory)
                          ? listing.subcategory
                          : listing.subcategory ? [listing.subcategory] : [];
                        return subs.length ? ` › ${subs.join(' · ')}` : '';
                      })()}
                    </AppText>
                  </View>
                )}
              </View>
            )}

            {/* Location & price: a label on one side, the value on the other */}
            <View style={styles.detailsBox} testID="listing-info-box">
              <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                <AppText weight="regular" style={styles.detailLabel}>{`${t('marketplace.location')}:`}</AppText>
                <View style={[styles.locationRow, { flexDirection: rowDir, flexShrink: 1 }]}>
                  <Image
                    source={LOCATION_ICON}
                    style={[styles.locationIcon, { marginRight: rtl ? 0 : 4, marginLeft: rtl ? 4 : 0 }]}
                    contentFit="contain" cachePolicy="memory-disk"
                  />
                  <AppText weight="semiBold" style={styles.detailValue} numberOfLines={1}>
                    {listing.location}
                  </AppText>
                </View>
              </View>
              <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                <AppText weight="regular" style={styles.detailLabel}>{`${t('marketplace.price')}:`}</AppText>
                <Text style={styles.price}>{priceLabel}</Text>
              </View>
            </View>

            {/* Seller: the label on one side, the name on the other */}
            <View style={styles.sellerBox}>
              <View style={[styles.detailRow, { flexDirection: rowDir }]} testID="listing-seller-row">
                <AppText weight="regular" style={styles.detailLabel}>{t('marketplace.posted_by')}</AppText>
                <AppText weight="semiBold" style={styles.detailValue} numberOfLines={1}>{listing.posterName}</AppText>
              </View>
            </View>
          </ScrollView>

          {/* Owner actions: share + edit + delete */}
          {isOwnListing && !readOnly && (
            <>
              <TouchableOpacity testID="listing-primary-btn" style={styles.buyBtn} onPress={openPicker} activeOpacity={0.85}>
                <AppText weight="bold" style={styles.buyText}>{t('marketplace.share_to_communities')}</AppText>
              </TouchableOpacity>
              {!isUnavailable && (
                <View style={[styles.ownerActionsRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <TouchableOpacity
                    testID="listing-edit-btn"
                    style={[styles.ownerActionBtn, styles.editBtn]}
                    onPress={() => onEdit?.(listing)}
                    activeOpacity={0.85}
                    disabled={isDeleting}
                  >
                    <AppText weight="bold" style={styles.editBtnText}>{t('marketplace.edit_listing')}</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="listing-delete-btn"
                    style={[styles.ownerActionBtn, styles.deleteBtn]}
                    onPress={() => handleDelete(listing)}
                    activeOpacity={0.85}
                    disabled={isDeleting}
                  >
                    {isDeleting
                      ? <ActivityIndicator size="small" color="#e53935" />
                      : <AppText weight="bold" style={styles.deleteBtnText}>{t('marketplace.delete_listing')}</AppText>}
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {/* Talk / In Discussion — pinned outside ScrollView */}
          {!isOwnListing && !readOnly && (
            isUnavailable ? (
              <View style={styles.reservedBtn}>
                <AppText weight="bold" style={styles.reservedText}>
                  {t('marketplace.in_discussion')}
                </AppText>
              </View>
            ) : (
              <TouchableOpacity
                testID="listing-primary-btn"
                style={[styles.buyBtn, isBuying && styles.buyBtnDisabled]}
                onPress={handleTalkWithSeller}
                activeOpacity={0.8}
                disabled={isBuying}
              >
                <AppText weight="bold" style={styles.buyText}>{t('marketplace.talk_with_seller')}</AppText>
              </TouchableOpacity>
            )
          )}
        </View>

        {/* Community picker — an overlay inside this modal, not a second Modal: iOS
            can't present a sibling Modal while this one is up, so it silently never
            appeared on the phone. */}
        {pickerOpen && (
          <View style={[StyleSheet.absoluteFill, styles.overlay]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setPickerOpen(false)} />
            <View style={styles.pickerCard}>
              <View style={[styles.pickerHeader, { flexDirection: rowDir }]}>
                <AppText weight="bold" style={styles.pickerTitle}>{t('marketplace.share_picker_title')}</AppText>
                <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={10} activeOpacity={0.7}>
                  <X size={20} color="#004aad" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              {loadingCommunities ? (
                <ActivityIndicator color="#004aad" style={{ marginVertical: 28 }} />
              ) : communities.length === 0 ? (
                <AppText weight="regular" style={[styles.pickerEmpty, { textAlign: rtl ? 'right' : 'left' }]}>
                  {t('marketplace.share_no_communities')}
                </AppText>
              ) : (
                <ScrollView style={{ maxHeight: screenHeight * 0.45 }} showsVerticalScrollIndicator={false}>
                  {communities.map((c) => {
                    const shared = alreadyShared.has(c.id);
                    const on = selected.has(c.id);
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.commRow, { flexDirection: rowDir }, shared && { opacity: 0.5 }]}
                        onPress={() => !shared && toggleCommunity(c.id)}
                        disabled={shared}
                        activeOpacity={0.75}
                      >
                        {c.photoURL ? (
                          <Image source={{ uri: c.photoURL }} style={styles.commAvatar} contentFit="cover" cachePolicy="memory-disk" />
                        ) : (
                          <View style={[styles.commAvatar, styles.commAvatarFallback]}>
                            <AppText weight="bold" style={styles.commAvatarInitial}>{(c.name ?? '?').charAt(0).toUpperCase()}</AppText>
                          </View>
                        )}
                        <AppText weight="semiBold" numberOfLines={1} style={[styles.commName, { textAlign: rtl ? 'right' : 'left' }]}>{c.name}</AppText>
                        {shared ? (
                          <AppText weight="semiBold" style={styles.commShared}>{t('marketplace.already_shared')}</AppText>
                        ) : (
                          <View style={[styles.commCheckbox, on && styles.commCheckboxOn]}>
                            {on && <Text style={styles.commCheckMark}>✓</Text>}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <TouchableOpacity
                style={[styles.shareSubmitBtn, (selected.size === 0 || sharing) && styles.buyBtnDisabled]}
                onPress={handleShare}
                disabled={selected.size === 0 || sharing}
                activeOpacity={0.85}
              >
                {sharing
                  ? <ActivityIndicator color="#fff" />
                  : <AppText weight="bold" style={styles.buyText}>{t('marketplace.share_submit', { count: selected.size })}</AppText>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pickerCard: {
    width: '88%',
    maxWidth: 420,
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#ffffff',
  },
  pickerHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  pickerTitle: { fontSize: 17, color: '#004aad' },
  pickerEmpty: { fontSize: 14, color: '#9aa0b8', marginVertical: 24 },
  commRow: { alignItems: 'center', gap: 12, paddingVertical: 9 },
  commAvatar: { width: 42, height: 42, borderRadius: 12 },
  commAvatarFallback: { backgroundColor: '#1e4fa3', alignItems: 'center', justifyContent: 'center' },
  commAvatarInitial: { color: '#fff', fontSize: 17 },
  commName: { flex: 1, fontSize: 15, color: '#2a2f5a' },
  commShared: { fontSize: 12, color: '#9aa0b8' },
  commCheckbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#b6c6e6', alignItems: 'center', justifyContent: 'center' },
  commCheckboxOn: { backgroundColor: '#004aad', borderColor: '#004aad' },
  commCheckMark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  shareSubmitBtn: {
    marginTop: 16,
    backgroundColor: '#004aad',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  // Shell, colours and buttons match PostListingSheet ("add a listing"): white
  // 24-radius card up to 85% of the screen, muted grey secondary text, 15%-blue
  // borders, radius-16 buttons. KEEP IN SYNC with PostListingSheet.tsx.
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
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
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: { flexShrink: 1 },
  scrollContent: { paddingBottom: 4 },

  imageWrap: {
    height: 180,
    backgroundColor: 'rgba(0,74,173,0.04)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
  },
  image: { width: '100%', height: 180 },
  imagePlaceholder: { fontSize: 52 },

  price: { fontSize: 18, fontWeight: '700', color: '#004aad' },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  locationIcon: { width: 14, height: 14 },

  detailsBox: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 13,
    color: 'rgba(15,15,31,0.4)',
  },
  detailValue: {
    fontSize: 13,
    color: '#004aad',
    flexShrink: 1,
  },
  // Condition keeps its per-value colour (it carries meaning), as in the add sheet.
  conditionBadge: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  conditionText: {
    color: '#fff',
    fontSize: 12,
  },

  sellerBox: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
  },

  // Primary: PostListingSheet's submitBtn.
  buyBtn: {
    backgroundColor: '#004aad',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  buyBtnDisabled: { opacity: 0.4 },
  buyText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Secondary: the add sheet's pill outline, full width.
  ownerActionsRow: { gap: 8, marginTop: 10 },
  ownerActionBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  editBtn: { borderColor: 'rgba(0,74,173,0.2)' },
  editBtnText: { color: '#004aad', fontSize: 15, fontWeight: '600' },
  deleteBtn: { borderColor: 'rgba(229,57,53,0.35)' },
  deleteBtnText: { color: '#e53935', fontSize: 15, fontWeight: '600' },

  reservedBtn: {
    backgroundColor: 'rgba(0,74,173,0.06)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  reservedText: { color: 'rgba(15,15,31,0.4)', fontSize: 15, fontWeight: '700' },
});

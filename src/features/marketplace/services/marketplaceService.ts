import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  writeBatch,
  deleteField,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { createPurchaseChat, sendMessage } from '@features/chat/services/chatService';
import type { MarketplaceListing } from '../types';

export async function confirmPurchase(
  listingId: string,
  buyerId: string,
  sellerId: string,
  listing: { productName: string; price: number },
  autoMessage: string,
): Promise<string> {
  const platformFee = Math.round(listing.price * 0.03);
  const chatId = await createPurchaseChat(buyerId, sellerId, listingId);

  const batch = writeBatch(db);
  batch.update(doc(db, 'marketplace_listings', listingId), {
    status: 'reserved',
    buyerId,
    platformFee,
    purchaseChatId: chatId,
  });
  await batch.commit();

  await sendMessage(chatId, buyerId, autoMessage);

  return chatId;
}

export async function confirmReceived(
  listingId: string,
  chatId: string,
  userId: string,
  systemMessage: string,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'marketplace_listings', listingId), { status: 'sold' });
  batch.update(doc(db, 'chats', chatId), {
    archived: true,
    archiveReason: 'completed',
    archivedAt: serverTimestamp(),
  });
  await batch.commit();

  // ── STRIPE CHARGE GOES HERE ──────────────────────────────────────────────
  // Call your payment backend / Stripe PaymentIntent here.
  // Input: listing.platformFee, listing.posterId (seller), listing.buyerId.
  // ─────────────────────────────────────────────────────────────────────────

  await sendMessage(chatId, userId, systemMessage);
}

export async function cancelPurchase(
  listingId: string,
  chatId: string,
  userId: string,
  systemMessage: string,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'marketplace_listings', listingId), {
    status: 'available',
    buyerId: deleteField(),
    purchaseChatId: deleteField(),
    sellerConfirmed: deleteField(),
    platformFee: deleteField(),
  });
  batch.update(doc(db, 'chats', chatId), {
    archived: true,
    archiveReason: 'cancelled',
    archivedAt: serverTimestamp(),
  });
  await batch.commit();

  await sendMessage(chatId, userId, systemMessage);
}

export async function markHandedOver(listingId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'marketplace_listings', listingId), {
    sellerConfirmed: true,
    sellerConfirmedAt: serverTimestamp(),
  });
  await batch.commit();
}

export function listenToListingByChatId(
  chatId: string,
  callback: (listing: MarketplaceListing | null) => void,
): () => void {
  const q = query(
    collection(db, 'marketplace_listings'),
    where('purchaseChatId', '==', chatId),
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
      return;
    }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as MarketplaceListing));
    // Prefer the active purchase (reserved) over a completed one (sold)
    const active = docs.find(d => d.status === 'reserved') ?? docs.find(d => d.status === 'sold') ?? null;
    callback(active);
  });
}

import {
  collection,
  doc,
  query,
  where,
  getDocs,
  onSnapshot,
  updateDoc,
  writeBatch,
  deleteField,
  serverTimestamp,
  addDoc,
  arrayUnion,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { deleteFile } from '@core/firebase/storage';
import { createPurchaseChat, sendMessage } from '@features/chat/services/chatService';
import type { Chat } from '@features/chat/types';
import type { MarketplaceListing } from '../types';

/**
 * Delete a listing the current user owns. Best-effort removes the listing's
 * image from Storage (never blocks the doc deletion), then deletes the document.
 * The public feed is a live onSnapshot, so the card disappears immediately.
 */
export async function deleteListing(listingId: string, imageUrl?: string | null): Promise<void> {
  if (imageUrl) {
    try {
      await deleteFile(imageUrl);
    } catch {
      // orphaned image is harmless — don't block the delete
    }
  }
  await deleteDoc(doc(db, 'marketplace_listings', listingId));
}

/**
 * Buyer taps "Talk with the Seller". This does NOT remove the listing from the
 * market — the item stays `available` and multiple buyers may open their own
 * discussion chats. The seller later accepts one of them (acceptDeal).
 *
 * Idempotent per buyer+listing: if this buyer already has an open purchase chat
 * for this listing, we reopen it instead of creating a duplicate.
 */
export async function startNegotiation(
  listingId: string,
  buyerId: string,
  buyerName: string,
  sellerId: string,
  productName: string,
  autoMessage: string,
): Promise<string> {
  // Mirror getOrCreateDM's query pattern (equality + array-contains) so no new
  // composite index is required; filter the rest in JS.
  const q = query(
    collection(db, 'chats'),
    where('type', '==', 'purchase'),
    where('members', 'array-contains', buyerId),
  );
  const snap = await getDocs(q);
  const existing = snap.docs.find(
    (d) => d.data().purchaseListingId === listingId && !d.data().archived,
  );
  if (existing) return existing.id;

  const chatId = await createPurchaseChat(buyerId, sellerId, listingId, productName, buyerName);
  await sendMessage(chatId, buyerId, autoMessage);
  return chatId;
}

/**
 * One party (seller or buyer) agrees to the deal. Records their agreement flag
 * on the chat and posts a system message. Does NOT touch the listing — the item
 * stays on the market until BOTH sides have agreed (then the caller finalizes
 * via acceptDeal).
 */
export async function agreeToDeal(
  chatId: string,
  field: 'sellerAgreed' | 'buyerAgreed',
  userId: string,
  systemMessage: string,
): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId), { [field]: true });
  await sendMessage(chatId, userId, systemMessage);
}

/**
 * Finalizer — runs only once BOTH sides have agreed. Pulls the item off the
 * market: the listing becomes `reserved` and is bound to this chat's buyer, and
 * the seller's other open chats for the same listing are superseded.
 */
export async function acceptDeal(
  listingId: string,
  chatId: string,
  buyerId: string,
  userId: string,
  systemMessage: string,
): Promise<void> {
  // Find the seller's OTHER open purchase chats for this listing so we can mark
  // them "not relevant" (superseded) — they become read-only for those buyers.
  // userId is the seller (a member of every purchase chat for their listing).
  const q = query(
    collection(db, 'chats'),
    where('type', '==', 'purchase'),
    where('members', 'array-contains', userId),
  );
  const snap = await getDocs(q);
  const superseded = snap.docs.filter(
    (d) => d.data().purchaseListingId === listingId && d.id !== chatId && !d.data().archived,
  );

  const batch = writeBatch(db);
  batch.update(doc(db, 'marketplace_listings', listingId), {
    status: 'reserved',
    buyerId,
    purchaseChatId: chatId,
  });
  // Both sides have agreed by this point — record it on the accepted chat.
  batch.update(doc(db, 'chats', chatId), {
    sellerAgreed: true,
    buyerAgreed: true,
  });
  for (const d of superseded) {
    batch.update(doc(db, 'chats', d.id), {
      archived: true,
      archiveReason: 'superseded',
      archivedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  await sendMessage(chatId, userId, systemMessage);
}

export async function confirmReceived(
  listingId: string,
  chatId: string,
  userId: string,
  systemMessage: string,
  sellerAlreadyConfirmed: boolean,
): Promise<void> {
  const batch = writeBatch(db);

  if (sellerAlreadyConfirmed) {
    // Both confirmed — complete the transaction
    batch.update(doc(db, 'marketplace_listings', listingId), { status: 'sold' });
    batch.update(doc(db, 'chats', chatId), {
      archived: true,
      archiveReason: 'completed',
      archivedAt: serverTimestamp(),
    });
  } else {
    // Seller hasn't confirmed yet — record buyer's confirmation only
    batch.update(doc(db, 'marketplace_listings', listingId), {
      buyerConfirmed: true,
      buyerConfirmedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  // ── STRIPE CHARGE GOES HERE (only when both confirmed) ───────────────────
  // Call your payment backend / Stripe PaymentIntent here.
  // Input: listing.platformFee, listing.posterId (seller), listing.buyerId.
  // ─────────────────────────────────────────────────────────────────────────

  await sendMessage(chatId, userId, systemMessage);
}

/**
 * Cancel/decline a purchase chat.
 * - Always archives the chat (cancelled) and posts a system message.
 * - Only resets the listing back to `available` when THIS chat is the accepted
 *   one (isAcceptedChat). A pending-chat cancel must not touch the listing —
 *   otherwise it would wipe another buyer's accepted deal.
 */
export async function cancelPurchase(
  listingId: string,
  chatId: string,
  userId: string,
  systemMessage: string,
  isAcceptedChat: boolean,
  productName: string,
  actorName: string,
): Promise<void> {
  const batch = writeBatch(db);
  if (isAcceptedChat) {
    batch.update(doc(db, 'marketplace_listings', listingId), {
      status: 'available',
      buyerId: deleteField(),
      purchaseChatId: deleteField(),
      sellerConfirmed: deleteField(),
      buyerConfirmed: deleteField(),
      platformFee: deleteField(),
    });
  }
  batch.update(doc(db, 'chats', chatId), {
    archived: true,
    archiveReason: 'cancelled',
    archivedAt: serverTimestamp(),
  });
  // Admin cancellation log — purchase chats aren't admin-readable, so record a
  // denormalized trace for the Money page.
  batch.set(doc(collection(db, 'cancellations')), {
    type: 'purchase',
    listingId,
    productName,
    actorId: userId,
    actorName,
    createdAt: serverTimestamp(),
  });
  await batch.commit();

  await sendMessage(chatId, userId, systemMessage);
}

export async function markHandedOver(
  listingId: string,
  chatId: string,
  userId: string,
  systemMessage: string,
  buyerAlreadyConfirmed: boolean,
): Promise<void> {
  const batch = writeBatch(db);

  if (buyerAlreadyConfirmed) {
    // Both confirmed — complete the transaction
    batch.update(doc(db, 'marketplace_listings', listingId), {
      sellerConfirmed: true,
      sellerConfirmedAt: serverTimestamp(),
      status: 'sold',
    });
    batch.update(doc(db, 'chats', chatId), {
      archived: true,
      archiveReason: 'completed',
      archivedAt: serverTimestamp(),
    });
  } else {
    // Buyer hasn't confirmed yet — record seller's confirmation only
    batch.update(doc(db, 'marketplace_listings', listingId), {
      sellerConfirmed: true,
      sellerConfirmedAt: serverTimestamp(),
    });
  }

  await batch.commit();
  if (buyerAlreadyConfirmed) {
    await sendMessage(chatId, userId, systemMessage);
  }
}

/**
 * Subscribe to a purchase chat AND its linked listing together. Needed because
 * the pending phase has no `purchaseChatId` on the listing yet (only set on
 * accept), so we resolve chat → listing via the chat's `purchaseListingId`.
 */
export function listenToPurchaseContext(
  chatId: string,
  callback: (ctx: { chat: Chat | null; listing: MarketplaceListing | null }) => void,
): () => void {
  let listingUnsub: (() => void) | null = null;
  let currentListingId: string | null = null;
  let latestChat: Chat | null = null;
  let latestListing: MarketplaceListing | null = null;

  const chatUnsub = onSnapshot(doc(db, 'chats', chatId), (chatSnap) => {
    if (!chatSnap.exists()) {
      if (listingUnsub) { listingUnsub(); listingUnsub = null; currentListingId = null; }
      callback({ chat: null, listing: null });
      return;
    }
    latestChat = { id: chatSnap.id, ...chatSnap.data() } as Chat;
    const listingId = latestChat.purchaseListingId ?? null;

    if (listingId !== currentListingId) {
      if (listingUnsub) { listingUnsub(); listingUnsub = null; }
      currentListingId = listingId;
      latestListing = null;
      if (listingId) {
        listingUnsub = onSnapshot(doc(db, 'marketplace_listings', listingId), (lSnap) => {
          latestListing = lSnap.exists()
            ? ({ id: lSnap.id, ...lSnap.data() } as MarketplaceListing)
            : null;
          callback({ chat: latestChat, listing: latestListing });
        });
      }
    }
    callback({ chat: latestChat, listing: latestListing });
  });

  return () => {
    chatUnsub();
    if (listingUnsub) listingUnsub();
  };
}

/**
 * Share a listing into each community's market channel (Part A: fixed id 'market').
 * Writes a channel message that renders today (has `text`) and carries structured
 * listing fields for Part C's card, updates each channel's lastMessage, and records
 * the community ids on the listing (`sharedTo`) to dedupe future shares.
 */
export async function shareListingToCommunities(
  listing: MarketplaceListing,
  communityIds: string[],
  sender: { id: string; name: string },
): Promise<void> {
  if (communityIds.length === 0) return;
  const text = `${listing.productName} · ₪${listing.price.toLocaleString()}`;
  await Promise.all(
    communityIds.map(async (cid) => {
      await addDoc(collection(db, 'chats', cid, 'channels', 'market', 'messages'), {
        senderId: sender.id,
        text,
        timestamp: serverTimestamp(),
        readBy: [sender.id],
        // Structured listing payload (consumed by Part C's card renderer):
        type: 'listing',
        listingId: listing.id,
        listingType: listing.type,
        title: listing.productName,
        price: listing.price,
        imageUrl: listing.imageUrl ?? null,
        posterId: listing.posterId,
        posterName: sender.name,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'chats', cid, 'channels', 'market'), {
        lastMessage: { text, senderId: sender.id, timestamp: serverTimestamp() },
      });
    }),
  );
  await updateDoc(doc(db, 'marketplace_listings', listing.id), {
    sharedTo: arrayUnion(...communityIds),
  });
}

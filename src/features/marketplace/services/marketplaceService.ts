import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { getOrCreateDM, sendMessage } from '@features/chat/services/chatService';

type BuyListingInput = {
  productName: string;
  price: number;
};

export async function buyListing(
  listingId: string,
  buyerId: string,
  sellerId: string,
  listing: BuyListingInput
): Promise<string> {
  await updateDoc(doc(db, 'marketplace_listings', listingId), {
    status: 'reserved',
    reservedBy: buyerId,
    reservedAt: serverTimestamp(),
  });

  const chatId = await getOrCreateDM(buyerId, sellerId);

  await sendMessage(
    chatId,
    buyerId,
    `היי! אני מעוניין לקנות את "${listing.productName}" במחיר ₪${listing.price} 🛒`
  );

  return chatId;
}

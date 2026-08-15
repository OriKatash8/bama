import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

async function createNotification(
  db: admin.firestore.Firestore,
  payload: {
    userId: string;
    title: string;
    message: string;
    data?: Record<string, string>;
  }
): Promise<void> {
  await db.collection('notifications').add({
    userId: payload.userId,
    title: payload.title,
    message: payload.message,
    data: payload.data ?? {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export const onNewChatMessage = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data() as {
      senderId?: string;
      text?: string;
      imageURL?: string;
      audioUrl?: string;
      videoUrl?: string;
    };

    if (!message.senderId) return;

    const { chatId } = context.params;
    const db = admin.firestore();

    const [senderDoc, chatDoc] = await Promise.all([
      db.collection('users').doc(message.senderId).get(),
      db.collection('chats').doc(chatId).get(),
    ]);

    if (!chatDoc.exists) return;

    const senderName: string = (senderDoc.data()?.displayName as string | undefined) ?? 'BAMA';
    const members: string[] = (chatDoc.data()?.members as string[] | undefined) ?? [];

    let body: string;
    if (message.imageURL) {
      body = 'שלח לך תמונה';
    } else if (message.audioUrl) {
      body = 'שלח לך הודעה קולית';
    } else if (message.videoUrl) {
      body = 'שלח לך וידאו';
    } else {
      const text = message.text ?? '';
      body = text.length > 100 ? text.slice(0, 97) + '...' : text;
    }

    const recipients = members.filter((uid) => uid !== message.senderId);
    await Promise.all(
      recipients.map((userId) =>
        createNotification(db, {
          userId,
          title: senderName,
          message: body,
          data: { type: 'message', chatId },
        })
      )
    );
  });

export const onNewPriceOffer = functions.firestore
  .document('priceOffers/{offerId}')
  .onCreate(async (snap, context) => {
    const offer = snap.data() as {
      projectId?: string;
      professionalId?: string;
    };

    if (!offer.projectId || !offer.professionalId) return;

    const db = admin.firestore();

    const [projectDoc, professionalDoc] = await Promise.all([
      db.collection('projects').doc(offer.projectId).get(),
      db.collection('users').doc(offer.professionalId).get(),
    ]);

    if (!projectDoc.exists) return;

    const clientId: string | undefined = projectDoc.data()?.clientId as string | undefined;
    const projectTitle: string = (projectDoc.data()?.title as string | undefined) ?? '';
    if (!clientId) return;
    if (clientId === offer.professionalId) return;

    const professionalName: string =
      (professionalDoc.data()?.displayName as string | undefined) ?? 'בעל מקצוע';

    await createNotification(db, {
      userId: clientId,
      title: 'הצעת מחיר חדשה',
      message: `${professionalName} הגיש הצעה לפרויקט ${projectTitle}`,
      data: { type: 'offer', projectId: offer.projectId, offerId: context.params.offerId },
    });
  });

export const onPriceOfferAccepted = functions.firestore
  .document('priceOffers/{offerId}')
  .onUpdate(async (change) => {
    const before = change.before.data() as { status?: string; projectId?: string; professionalId?: string };
    const after = change.after.data() as { status?: string; projectId?: string; professionalId?: string };

    if (before.status === 'accepted' || after.status !== 'accepted') return;
    if (!after.projectId || !after.professionalId) return;

    const db = admin.firestore();
    const projectDoc = await db.collection('projects').doc(after.projectId).get();
    if (!projectDoc.exists) return;

    const projectTitle: string = (projectDoc.data()?.title as string | undefined) ?? '';
    const clientId: string | undefined = projectDoc.data()?.clientId as string | undefined;
    if (after.professionalId === clientId) return;

    await createNotification(db, {
      userId: after.professionalId,
      title: 'ההצעה שלך התקבלה 🎉',
      message: `ההצעה שלך לפרויקט ${projectTitle} התקבלה`,
      data: { type: 'offer_accepted', projectId: after.projectId },
    });
  });

export const onMarketplacePurchase = functions.firestore
  .document('marketplace_listings/{listingId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() as { status?: string };
    const after = change.after.data() as {
      status?: string;
      posterId?: string;
      buyerId?: string;
      productName?: string;
    };

    if (before.status === 'reserved' || after.status !== 'reserved') return;
    if (!after.posterId || !after.buyerId) return;
    if (after.posterId === after.buyerId) return;

    const productName: string = after.productName ?? 'המוצר';

    await createNotification(admin.firestore(), {
      userId: after.posterId,
      title: 'רכישה חדשה',
      message: `מישהו רכש את ${productName} שלך`,
      data: { type: 'purchase', listingId: context.params.listingId },
    });
  });

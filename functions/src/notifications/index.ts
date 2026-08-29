import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { Expo } from 'expo-server-sdk';
import type { ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo();

export const onNotificationCreate = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snap) => {
    const notification = snap.data();

    // Tokens now live in a top-level pushTokens/{token} collection keyed by the
    // device token, each carrying { userId }. Send to every device of the user.
    const db = admin.firestore();
    const snapshot = await db
      .collection('pushTokens')
      .where('userId', '==', notification.userId)
      .get();

    const tokenDocs = snapshot.docs.filter((d) => Expo.isExpoPushToken(d.id));
    if (tokenDocs.length === 0) {
      console.log('[push] no valid tokens for user', notification.userId);
      return;
    }

    // messages[i] corresponds to tokenDocs[i]; tickets return in chunk order.
    const messages: ExpoPushMessage[] = tokenDocs.map((d) => ({
      to: d.id,
      sound: 'default',
      title: notification.title ?? 'BAMA',
      body: notification.body ?? notification.message ?? 'You have a new notification',
      data: notification.data ?? {},
    }));

    const chunks = expo.chunkPushNotifications(messages);
    let i = 0;
    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        for (const ticket of tickets) {
          const tokenDoc = tokenDocs[i++];
          if (ticket.status === 'error') {
            console.error('[push] ticket error:', ticket.message, ticket.details);
            if ((ticket.details as { error?: string } | undefined)?.error === 'DeviceNotRegistered' && tokenDoc) {
              await tokenDoc.ref.delete();
              console.log('[push] pruned DeviceNotRegistered token', tokenDoc.id);
            }
          } else {
            console.log('[push] ticket ok, id:', ticket.id);
          }
        }
      } catch (e) {
        console.error('[push] sendPushNotificationsAsync error:', e);
        i += chunk.length; // keep the ticket↔token index aligned on chunk failure
      }
    }
  });

export * from './triggers';

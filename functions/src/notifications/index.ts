import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { Expo } from 'expo-server-sdk';
import type { ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo();

export const onNotificationCreate = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snap) => {
    const notification = snap.data();

    const userDoc = await admin.firestore()
      .collection('users')
      .doc(notification.userId)
      .get();

    const expoPushToken: string | undefined = userDoc.data()?.expoPushToken;
    if (!expoPushToken) {
      console.log('[push] no expoPushToken for user', notification.userId);
      return;
    }

    if (!Expo.isExpoPushToken(expoPushToken)) {
      console.error('[push] invalid Expo push token:', expoPushToken);
      return;
    }

    const message: ExpoPushMessage = {
      to: expoPushToken,
      sound: 'default',
      title: notification.title ?? 'BAMA',
      body: notification.body ?? notification.message ?? 'You have a new notification',
      data: notification.data ?? {},
    };

    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        for (const ticket of tickets) {
          if (ticket.status === 'error') {
            console.error('[push] ticket error:', ticket.message, ticket.details);
          } else {
            console.log('[push] ticket ok, id:', ticket.id);
          }
        }
      } catch (e) {
        console.error('[push] sendPushNotificationsAsync error:', e);
      }
    }
  });

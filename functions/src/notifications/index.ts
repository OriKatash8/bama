import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export const onNotificationCreate = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snap) => {
    const notification = snap.data();
    const userDoc = await admin.firestore().collection('users').doc(notification.userId).get();
    const fcmToken: string | undefined = userDoc.data()?.fcmToken;

    if (!fcmToken) return;

    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: 'BAMA',
        body: notification.message ?? 'You have a new notification',
      },
    });
  });

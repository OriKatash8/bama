import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export const onBookingCreate = functions.firestore
  .document('bookings/{bookingId}')
  .onCreate(async (snap) => {
    const booking = snap.data();
    await admin.firestore().collection('notifications').add({
      userId: booking.professionalId,
      type: 'booking_request',
      bookingId: snap.id,
      message: 'You have a new booking request',
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

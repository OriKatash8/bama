import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@core/firebase/config';

/**
 * The user's phone number, in `users/{uid}/private/contact`.
 *
 * NOT on users/{uid}: that doc is readable by every signed-in user. This one is
 * owner-only by rule; the other side of a project gets the number from the
 * getContactPhone callable, and only once the professional's part has ended.
 * The value is always E.164 (normalizePhone) — the rules reject anything else.
 */
const contactPath = (uid: string) => `users/${uid}/private/contact`;

export async function savePhone(uid: string, e164: string): Promise<void> {
  await setDoc(doc(db, contactPath(uid)), { phone: e164, updatedAt: serverTimestamp() });
}

/** The user's number as it changes; null when they have none (yet). */
export function subscribePhone(uid: string, onChange: (phone: string | null) => void, onError?: (e: unknown) => void) {
  return onSnapshot(
    doc(db, contactPath(uid)),
    (snap) => {
      const phone = snap.data()?.phone;
      onChange(typeof phone === 'string' && phone ? phone : null);
    },
    onError,
  );
}

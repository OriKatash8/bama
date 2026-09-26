import { getDocument, setDocument, updateDocument } from '@core/firebase/firestore';
import type { User } from '@core/types/user';

export async function syncUser(
  uid: string,
  info: { email: string; displayName: string; photoURL: string | null },
  setUser: (user: User) => void,
  terms?: { acceptedAt: number; version: string; ageConfirmedAt: number },
): Promise<void> {
  // `info.email` is used for the IN-MEMORY user only; it is deliberately absent
  // from every write below. See User.email.
  const existing = await getDocument<User>(`users/${uid}`);
  if (!existing) {
    const userData: User = {
      id: uid,
      displayName: info.displayName,
      photoURL: info.photoURL,
      createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      termsAcceptedAt: terms?.acceptedAt ?? null,
      termsVersion: terms?.version ?? undefined,
      ageConfirmed: terms != null ? true : undefined,
      ageConfirmedAt: terms?.ageConfirmedAt ?? null,
    };
    await setDocument(`users/${uid}`, userData);
    // In memory only — `email` is never persisted to the document.
    setUser({ ...userData, email: info.email });
  } else {
    // Backfill any fields that are blank on the stored doc but present in info.
    // Only fills blanks — never overwrites non-empty values.
    const backfill: Partial<User> = {};
    if (!existing.displayName && info.displayName) backfill.displayName = info.displayName;
    if (!existing.photoURL && info.photoURL) backfill.photoURL = info.photoURL;

    if (Object.keys(backfill).length > 0) {
      await updateDocument<User>(`users/${uid}`, backfill);
      setUser({ ...existing, ...backfill, email: info.email });
    } else {
      setUser({ ...existing, email: info.email });
    }
  }
}

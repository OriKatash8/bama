import { getDocument, setDocument, updateDocument } from '@core/firebase/firestore';
import type { User } from '@core/types/user';

export async function syncUser(
  uid: string,
  info: { email: string; displayName: string; photoURL: string | null },
  setUser: (user: User) => void,
  terms?: { acceptedAt: number; version: string },
): Promise<void> {
  const existing = await getDocument<User>(`users/${uid}`);
  if (!existing) {
    const userData: User = {
      id: uid,
      email: info.email,
      displayName: info.displayName,
      photoURL: info.photoURL,
      createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      termsAcceptedAt: terms?.acceptedAt ?? null,
      termsVersion: terms?.version ?? undefined,
    };
    await setDocument(`users/${uid}`, userData);
    setUser(userData);
  } else {
    // Backfill any fields that are blank on the stored doc but present in info.
    // Only fills blanks — never overwrites non-empty values.
    const backfill: Partial<User> = {};
    if (!existing.displayName && info.displayName) backfill.displayName = info.displayName;
    if (!existing.email && info.email) backfill.email = info.email;
    if (!existing.photoURL && info.photoURL) backfill.photoURL = info.photoURL;

    if (Object.keys(backfill).length > 0) {
      await updateDocument<User>(`users/${uid}`, backfill);
      setUser({ ...existing, ...backfill });
    } else {
      setUser(existing);
    }
  }
}

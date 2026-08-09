import { getDocument, setDocument } from '@core/firebase/firestore';
import type { User } from '@core/types/user';

export async function syncUser(
  uid: string,
  info: { email: string; displayName: string; photoURL: string | null },
  setUser: (user: User) => void,
): Promise<void> {
  const existing = await getDocument<User>(`users/${uid}`);
  if (!existing) {
    const userData: User = {
      id: uid,
      email: info.email,
      displayName: info.displayName,
      photoURL: info.photoURL,
      createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };
    await setDocument(`users/${uid}`, userData);
    setUser(userData);
  } else {
    setUser(existing);
  }
}

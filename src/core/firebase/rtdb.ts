import { ref, onValue, set, update, remove, push } from 'firebase/database';
import { rtdb } from './config';

export function subscribeToPath<T>(
  path: string,
  callback: (data: T | null) => void
): () => void {
  const dbRef = ref(rtdb, path);
  return onValue(dbRef, (snapshot) => {
    callback(snapshot.exists() ? (snapshot.val() as T) : null);
  });
}

export async function writePath<T>(path: string, data: T): Promise<void> {
  await set(ref(rtdb, path), data);
}

export async function updatePath<T extends object>(
  path: string,
  data: Partial<T>
): Promise<void> {
  await update(ref(rtdb, path), data);
}

export async function deletePath(path: string): Promise<void> {
  await remove(ref(rtdb, path));
}

export async function pushToPath<T>(path: string, data: T): Promise<string> {
  const newRef = await push(ref(rtdb, path), data);
  return newRef.key!;
}

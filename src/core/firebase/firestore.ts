import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  getDocs,
  onSnapshot,
  addDoc,
  where,
  writeBatch,
  arrayUnion,
  type QueryConstraint,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './config';

export async function getDocument<T>(path: string): Promise<T | null> {
  const snap = await getDoc(doc(db, path));
  return snap.exists() ? (snap.data() as T) : null;
}

export async function setDocument<T extends DocumentData>(path: string, data: T): Promise<void> {
  await setDoc(doc(db, path), data);
}

export async function updateDocument<T extends DocumentData>(
  path: string,
  data: Partial<T>
): Promise<void> {
  await updateDoc(doc(db, path), data as DocumentData);
}

export async function deleteDocument(path: string): Promise<void> {
  await deleteDoc(doc(db, path));
}

export async function queryDocuments<T>(
  collectionPath: string,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  const q = query(collection(db, collectionPath), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

export function subscribeToDocument<T>(
  path: string,
  callback: (data: T | null) => void
): () => void {
  return onSnapshot(doc(db, path), (snap) => {
    callback(snap.exists() ? (snap.data() as T) : null);
  });
}

export function subscribeToCollection<T>(
  collectionPath: string,
  callback: (data: T[]) => void,
  ...constraints: QueryConstraint[]
): () => void {
  const q =
    constraints.length > 0
      ? query(collection(db, collectionPath), ...constraints)
      : query(collection(db, collectionPath));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
  });
}

export async function mergeDocument<T extends DocumentData>(
  path: string,
  data: Partial<T>
): Promise<void> {
  await setDoc(doc(db, path), data as DocumentData, { merge: true });
}

export async function queryByField<T>(
  collectionPath: string,
  field: string,
  value: unknown
): Promise<T[]> {
  return queryDocuments<T>(collectionPath, where(field, '==', value));
}

export async function addDocument<T extends DocumentData>(
  collectionPath: string,
  data: T
): Promise<string> {
  const ref = await addDoc(collection(db, collectionPath), data);
  return ref.id;
}

export async function runBatchUpdates(
  updates: Array<{ path: string; data: DocumentData }>
): Promise<void> {
  const batch = writeBatch(db);
  for (const { path, data } of updates) {
    batch.update(doc(db, path), data);
  }
  await batch.commit();
}

export { where, arrayUnion };

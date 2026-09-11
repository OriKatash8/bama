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
import { chunkIn, mergeById } from './chunkIn';

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
  return onSnapshot(
    doc(db, path),
    (snap) => callback(snap.exists() ? (snap.data() as T) : null),
    // Firestore logs "Uncaught Error in snapshot listener" with NO path when a
    // listener has no error handler, which is unactionable across dozens of
    // listeners. Name the path, and call back with null so a caller waiting on
    // first data stops waiting — a permanent spinner reads as a hung app.
    (err) => {
      console.error(`[firestore] subscribeToDocument(${path}) failed:`, err?.code, err?.message);
      callback(null);
    },
  );
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
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
    // Same reason as above. Without this the failure is anonymous and the
    // caller's isLoading never clears, because it is only cleared in the success
    // path — the stuck-spinner shape.
    (err) => {
      console.error(`[firestore] subscribeToCollection(${collectionPath}) failed:`, err?.code, err?.message);
      callback([]);
    },
  );
}

/**
 * Firestore's `in` operator takes up to 30 values, but that is NOT the binding
 * limit here. The rules for priceOffers/bundleOffers resolve the owning project
 * with a `get()`, and the rules engine allows at most 20 document-access calls
 * per query — so an `in` list longer than that is denied outright, with
 * `permission-denied` rather than anything that names the real cause.
 *
 * Measured against production: 20 ids ALLOW, 26 ids permission-denied. A client
 * who accumulated 22 projects therefore lost their ENTIRE offers page, silently,
 * because the listener had no error handler and the caller only cleared its
 * loading flag in the success path. That is a permanent spinner.
 *
 * So: split into chunks well under the budget, subscribe to each, and merge.
 * Results are keyed by document id, so a document matching in two chunks (it
 * cannot today, but `in` lists are caller-supplied) still appears once.
 */
export function subscribeToCollectionIn<T>(
  collectionPath: string,
  field: string,
  values: string[],
  callback: (data: T[]) => void,
  ...constraints: QueryConstraint[]
): () => void {
  if (values.length === 0) {
    callback([]);
    return () => {};
  }
  const chunks = chunkIn(values);

  // One bucket per chunk, merged on every update. A chunk that errors calls back
  // with [] (see subscribeToCollection), so one denied chunk degrades that slice
  // rather than hanging the whole page.
  const buckets: T[][] = chunks.map(() => []);
  const emit = () => callback(mergeById(buckets as (T & { id: string })[][]));

  const unsubs = chunks.map((chunk, i) => subscribeToCollection<T>(
    collectionPath,
    (rows) => { buckets[i] = rows; emit(); },
    where(field, 'in', chunk),
    ...constraints,
  ));
  return () => unsubs.forEach((u) => u());
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

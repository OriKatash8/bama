import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  type Unsubscribe,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../../../core/firebase/config';
import type { Meeting } from '../../../core/types/project';

function docToMeeting(d: QueryDocumentSnapshot<DocumentData>): Meeting {
  const data = d.data();
  return {
    id: d.id,
    projectId: data.projectId as string,
    title: data.title as string,
    date: data.date as string,
    time: data.time as string,
    location: data.location as string,
    invitedIds: (data.invitedIds ?? []) as string[],
    createdBy: data.createdBy as string,
    createdAt: data.createdAt,
  };
}

export function listenToMeetings(
  projectId: string,
  callback: (meetings: Meeting[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'projects', projectId, 'meetings'),
    orderBy('date', 'asc'),
    orderBy('time', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    console.log('[listenToMeetings] received', snap.docs.length, 'meetings for project', projectId);
    callback(snap.docs.map(docToMeeting));
  }, (err) => {
    console.error('[listenToMeetings] snapshot error:', err.code, err.message);
  });
}

export async function addMeeting(
  projectId: string,
  createdBy: string,
  data: { title: string; date: string; time: string; location: string; invitedIds: string[] },
): Promise<void> {
  await addDoc(collection(db, 'projects', projectId, 'meetings'), {
    ...data,
    projectId,
    createdBy,
    createdAt: serverTimestamp(),
  });
}

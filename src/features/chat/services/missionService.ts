import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  type Unsubscribe,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../../../core/firebase/config';
import type { Mission, MissionStatus } from '../../../core/types/project';

function docToMission(d: QueryDocumentSnapshot<DocumentData>): Mission {
  const data = d.data();
  return {
    id: d.id,
    projectId: data.projectId as string,
    title: data.title as string,
    assignedTo: (data.assignedTo ?? []) as string[],
    status: data.status as MissionStatus,
    dueDate: data.dueDate as string | undefined,
    createdBy: data.createdBy as string,
    createdAt: data.createdAt,
  };
}

export function listenToMissions(
  projectId: string,
  callback: (missions: Mission[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'projects', projectId, 'missions'),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    console.log('[listenToMissions] received', snap.docs.length, 'missions for project', projectId);
    snap.docs.forEach(d => console.log('[listenToMissions] doc', d.id, JSON.stringify(d.data())));
    callback(snap.docs.map(docToMission));
  }, (err) => {
    console.error('[listenToMissions] snapshot error:', err.code, err.message);
  });
}

export async function addMission(
  projectId: string,
  createdBy: string,
  data: { title: string; assignedTo: string[]; dueDate?: string },
): Promise<void> {
  const { dueDate, ...rest } = data;
  const payload: Record<string, unknown> = {
    ...rest,
    projectId,
    status: 'todo' as MissionStatus,
    createdBy,
    createdAt: serverTimestamp(),
  };
  if (dueDate !== undefined) payload.dueDate = dueDate;
  console.log('[addMission] writing to projects/' + projectId + '/missions', payload);
  await addDoc(collection(db, 'projects', projectId, 'missions'), payload);
  console.log('[addMission] success');
}

export async function updateMissionStatus(
  projectId: string,
  missionId: string,
  status: MissionStatus,
): Promise<void> {
  await updateDoc(doc(db, 'projects', projectId, 'missions', missionId), { status });
}

import { useEffect, useState } from 'react';
import { collection, getCountFromServer, query, where, type Query } from 'firebase/firestore';
import { db } from '@core/firebase/config';

export type AdminCounts = {
  users: number | null;
  projects: number | null;
  courses: number | null;
  communities: number | null;
  openReports: number | null;
};

/** Count a query independently — a single failure returns null (rendered "—")
 *  instead of throwing and zeroing every other stat. */
async function countOf(q: Query): Promise<number | null> {
  try {
    return (await getCountFromServer(q)).data().count;
  } catch (e) {
    console.warn('[AdminDashboard] count query failed:', e);
    return null;
  }
}

/** Platform totals, read once. `null` until they arrive. */
export function useAdminCounts(): AdminCounts | null {
  const [counts, setCounts] = useState<AdminCounts | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      // Communities live in `chats` with type == 'community' (no `communities` collection).
      const [users, projects, courses, communities, openReports] = await Promise.all([
        countOf(collection(db, 'users')),
        countOf(collection(db, 'projects')),
        countOf(collection(db, 'courses')),
        countOf(query(collection(db, 'chats'), where('type', '==', 'community'))),
        countOf(query(collection(db, 'reports'), where('status', '==', 'pending'))),
      ]);
      if (active) setCounts({ users, projects, courses, communities, openReports });
    })();
    return () => {
      active = false;
    };
  }, []);
  return counts;
}

import { useEffect, useState } from 'react';
import { collection, getCountFromServer, query, where, type Query } from 'firebase/firestore';
import { db } from '@core/firebase/config';

export type AdminCounts = {
  users: number | null;
  projects: number | null;
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
      const [users, projects, openReports] = await Promise.all([
        countOf(collection(db, 'users')),
        countOf(collection(db, 'projects')),
        countOf(query(collection(db, 'reports'), where('status', '==', 'pending'))),
      ]);
      if (active) setCounts({ users, projects, openReports });
    })();
    return () => {
      active = false;
    };
  }, []);
  return counts;
}

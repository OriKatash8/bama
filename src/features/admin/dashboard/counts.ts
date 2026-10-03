import { useEffect, useState } from 'react';
import { collection, documentId, getCountFromServer, query, where, type Query } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { useDemoStore } from '@core/stores/demoStore';

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
  // Demo accounts (App Review) are not users of the platform; they stay out of
  // the total. `not-in` takes at most 10 values — there are three.
  const demoUids = useDemoStore((s) => s.config.uids);
  const demoKey = demoUids.join(',');
  useEffect(() => {
    let active = true;
    (async () => {
      const [users, projects, openReports] = await Promise.all([
        countOf(demoUids.length > 0 && demoUids.length <= 10
          ? query(collection(db, 'users'), where(documentId(), 'not-in', demoUids))
          : collection(db, 'users')),
        countOf(collection(db, 'projects')),
        countOf(query(collection(db, 'reports'), where('status', '==', 'pending'))),
      ]);
      if (active) setCounts({ users, projects, openReports });
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- demoKey stands for demoUids
  }, [demoKey]);
  return counts;
}

import { useEffect, useMemo, useState } from 'react';
import { queryDocuments, getDocument } from '@core/firebase/firestore';
import { SYSTEM_USER_ID } from '@core/constants/system';
import type { User, ProfessionalProfile } from '@core/types/user';
import { periodBuckets, type Period } from './periodBuckets';

type Rec = { ts: number; isClient: boolean; isPro: boolean };

function secondsOf(ts?: { seconds?: number } | null): number {
  return ts?.seconds ?? 0;
}

/**
 * New-registration stats for the admin dashboard. Reads every user once (+ each
 * professional profile doc) and buckets by day/week/month/year. `client` = clientOnboarded,
 * `pro` = professional profile completed; a user may count in both (the split
 * compares two metrics, not a partition).
 */
export function useRegistrationStats(period: Period, rtl: boolean) {
  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const users = (await queryDocuments<User>('users')).filter((u) => u.id !== SYSTEM_USER_ID);
        const recs = await Promise.all(
          users.map(async (u) => {
            const profile = await getDocument<ProfessionalProfile>(`users/${u.id}/profile/data`).catch(() => null);
            return {
              ts: secondsOf(u.createdAt),
              isClient: u.clientOnboarded === true,
              isPro: profile?.proProfileCompleted === true,
            };
          }),
        );
        if (active) { setRecords(recs); setLoading(false); }
      } catch {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const { labels, total, client, pro } = useMemo(() => {
    const { starts, end, labels: lbls } = periodBuckets(period, new Date(), rtl ? 'he-IL' : 'en-US');
    const count = starts.length;
    const t = new Array(count).fill(0);
    const c = new Array(count).fill(0);
    const p = new Array(count).fill(0);

    for (const r of records) {
      if (!r.ts || r.ts < starts[0] || r.ts >= end) continue;
      // The last bucket whose start is at or before the registration.
      let idx = count - 1;
      while (idx > 0 && starts[idx] > r.ts) idx--;
      t[idx] += 1;
      if (r.isClient) c[idx] += 1;
      if (r.isPro) p[idx] += 1;
    }

    return { labels: lbls, total: t as number[], client: c as number[], pro: p as number[] };
  }, [records, period, rtl]);

  return { labels, total, client, pro, loading };
}

import { useEffect, useMemo, useState } from 'react';
import { queryDocuments, getDocument } from '@core/firebase/firestore';
import { SYSTEM_USER_ID } from '@core/constants/system';
import type { User, ProfessionalProfile } from '@core/types/user';

type Period = 'daily' | 'weekly';
type Rec = { ts: number; isClient: boolean; isPro: boolean };

const DAY = 86400;

function secondsOf(ts?: { seconds?: number } | null): number {
  return ts?.seconds ?? 0;
}

/** Start-of-day (local) for a unix-seconds timestamp. */
function startOfDay(sec: number): number {
  const d = new Date(sec * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/**
 * New-registration stats for the admin dashboard. Reads every user once (+ each
 * professional profile doc) and buckets by day/week. `client` = clientOnboarded,
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
    const locale = rtl ? 'he-IL' : 'en-US';
    const now = new Date();
    const todayStart = startOfDay(Math.floor(now.getTime() / 1000));

    const count = period === 'daily' ? 7 : 6;
    const spanDays = period === 'daily' ? 1 : 7;

    // Bucket start timestamps (oldest → newest) + labels.
    const bucketStarts: number[] = [];
    const lbls: string[] = [];
    for (let i = 0; i < count; i++) {
      const start = todayStart - (count - 1 - i) * spanDays * DAY;
      bucketStarts.push(start);
      const d = new Date(start * 1000);
      lbls.push(
        period === 'daily'
          ? d.toLocaleDateString(locale, { weekday: 'short' })
          : d.toLocaleDateString(locale, { day: 'numeric', month: 'numeric' }),
      );
    }
    const rangeStart = bucketStarts[0];
    const rangeEnd = todayStart + spanDays * DAY; // exclusive upper bound

    const t = new Array(count).fill(0);
    const c = new Array(count).fill(0);
    const p = new Array(count).fill(0);

    for (const r of records) {
      if (!r.ts || r.ts < rangeStart || r.ts >= rangeEnd) continue;
      const idx = Math.min(count - 1, Math.floor((startOfDay(r.ts) - rangeStart) / (spanDays * DAY)));
      if (idx < 0 || idx >= count) continue;
      t[idx] += 1;
      if (r.isClient) c[idx] += 1;
      if (r.isPro) p[idx] += 1;
    }

    return { labels: lbls, total: t as number[], client: c as number[], pro: p as number[] };
  }, [records, period, rtl]);

  return { labels, total, client, pro, loading };
}

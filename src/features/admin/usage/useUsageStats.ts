import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { callFunction } from '@core/firebase/functions';
import type { UsageDoc } from './types';

export type UsageState = 'loading' | 'ok' | 'empty' | 'error';
export type RefreshResult = { ok: boolean; throttled: boolean; errors: string[] };

const refreshUsageStats = callFunction<Record<string, never>, RefreshResult>('refreshUsageStats', 'europe-west1');

/**
 * Live `adminStats/usage` plus an on-demand refresh. `empty` = the doc does not exist yet
 * (nothing collected); `error` = the listener failed (e.g. not an admin) and is NOT shown as empty.
 */
export function useUsageStats() {
  const [data, setData] = useState<UsageDoc | null>(null);
  const [state, setState] = useState<UsageState>('loading');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'adminStats', 'usage'),
      (snap) => {
        if (!snap.exists()) { setData(null); setState('empty'); return; }
        setData(snap.data() as UsageDoc);
        setState('ok');
      },
      (e) => {
        console.error('[useUsageStats] listener failed:', e);
        setState('error');
      }
    );
  }, []);

  /** Runs the collection now. Throws on failure so the caller can tell the admin. */
  const refresh = useCallback(async (): Promise<RefreshResult> => {
    setRefreshing(true);
    try {
      return await refreshUsageStats({});
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { data, state, refreshing, refresh };
}

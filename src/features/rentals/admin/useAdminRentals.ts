import { useCallback, useEffect, useState } from 'react';
import { getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { toQuery } from '../queries';
import { adminCompaniesSpec, adminCompanyItemsSpec } from '../querySpecs';
import type { RentalCompany, RentalItem } from '../types';

/**
 * Admin: every company, live. A handful of documents, admin-only (the rules
 * deny this query to everyone else), so a listener is fine here — the sync's
 * progress and errors show up without a refresh.
 */
export function useAdminRentalCompanies() {
  const [companies, setCompanies] = useState<RentalCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      toQuery(db, adminCompaniesSpec()),
      (snap) => {
        setCompanies(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RentalCompany));
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, []);

  return { companies, loading, error };
}

/**
 * Admin: every item of one company, read once (a catalogue is hundreds of
 * documents — no listener). `reload` after any change the admin makes.
 */
export function useAdminCompanyItems(companyId: string | null) {
  const [version, setVersion] = useState(0);
  const key = companyId ? `${companyId}#${version}` : null;
  // Each result names the request it answers; a reload keeps the old list on
  // screen until the new one arrives.
  const [result, setResult] = useState<{ key: string | null; companyId: string | null; items: RentalItem[]; error: string | null }>(
    { key: null, companyId: null, items: [], error: null },
  );

  useEffect(() => {
    if (!companyId || !key) return;
    let cancelled = false;
    getDocs(toQuery(db, adminCompanyItemsSpec(companyId)))
      .then((snap) => {
        if (cancelled) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RentalItem);
        setResult({ key, companyId, items: list.sort((a, b) => a.name.localeCompare(b.name)), error: null });
      })
      .catch((e: Error) => { if (!cancelled) setResult({ key, companyId, items: [], error: e.message }); });
    return () => { cancelled = true; };
  }, [companyId, key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const sameCompany = !!companyId && result.companyId === companyId;
  return {
    items: sameCompany ? result.items : [],
    loading: !!key && result.key !== key,
    error: sameCompany ? result.error : null,
    reload,
  };
}

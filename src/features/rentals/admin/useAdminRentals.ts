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
  const [items, setItems] = useState<RentalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!companyId) { setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    getDocs(toQuery(db, adminCompanyItemsSpec(companyId)))
      .then((snap) => {
        if (cancelled) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RentalItem);
        setItems(list.sort((a, b) => a.name.localeCompare(b.name)));
        setError(null);
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { items, loading, error, reload };
}

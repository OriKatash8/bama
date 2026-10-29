import { useEffect, useState } from 'react';
import { getDocs } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { toQuery } from '../queries';
import { partnerCompaniesSpec } from '../querySpecs';
import type { RentalCompany } from '../types';

/** The rental tab's partner row: active companies, read once (they change rarely). */
export function usePartnerCompanies(enabled = true) {
  const [result, setResult] = useState<{ done: boolean; companies: RentalCompany[] }>({ done: false, companies: [] });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getDocs(toQuery(db, partnerCompaniesSpec()))
      .then((snap) => {
        if (!cancelled) setResult({ done: true, companies: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RentalCompany) });
      })
      // No partner row is better than an error on the tab.
      .catch(() => { if (!cancelled) setResult({ done: true, companies: [] }); });
    return () => { cancelled = true; };
  }, [enabled]);

  return { companies: enabled ? result.companies : [], loading: enabled && !result.done };
}

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@core/firebase/config';

export type UserBasics = { displayName: string; photoURL: string | null };

/**
 * Names and photos for a set of users, read once each.
 *
 * Three states per id, and callers must tell them apart:
 *   - absent key  → not loaded yet
 *   - `null`      → no usable identity (doc missing, blank name, or read failed)
 *   - UserBasics  → resolved
 *
 * The review card keeps a professional's actions disabled until their name has
 * RESOLVED. A live רלוונטי next to a blank or loading name is a way to confirm
 * the wrong person.
 */
export function useUserBasics(ids: readonly string[]): Record<string, UserBasics | null> {
  const [users, setUsers] = useState<Record<string, UserBasics | null>>({});
  const key = [...new Set(ids)].sort().join(',');

  useEffect(() => {
    let cancelled = false;
    const missing = key ? key.split(',').filter((id) => !(id in users)) : [];
    if (missing.length === 0) return;
    Promise.all(missing.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'users', id));
        const data = snap.exists() ? snap.data() as { displayName?: string; photoURL?: string | null } : null;
        const name = data?.displayName?.trim();
        return [id, name ? { displayName: name, photoURL: data?.photoURL ?? null } : null] as const;
      } catch (err) {
        console.error('[useUserBasics] read failed', id, err);
        return [id, null] as const;
      }
    })).then((entries) => {
      if (!cancelled) setUsers((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => { cancelled = true; };
    // `users` is deliberately not a dependency: resolving an id must not re-run
    // the read for the ids already resolved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return users;
}

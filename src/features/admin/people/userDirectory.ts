import { useEffect, useState } from 'react';
import { callFunction } from '@core/firebase/functions';

/** One account as `adminListUsers` returns it. The email is from Firebase Auth (the user document has none). */
export type DirectoryUser = {
  uid: string;
  displayName: string;
  email: string | null;
  disabled: boolean;
  createdAt: number | null;
};

const listUsers = callFunction<Record<string, never>, { users: DirectoryUser[]; truncated: boolean }>('adminListUsers');

/**
 * Who is who, for the whole admin session: ONE `adminListUsers` call, cached, so every screen can show
 * a person by full name (and offer their email in the details) without a read per row. Admin only, like
 * the callable. A failed load is not cached, so the next screen retries.
 */
let cache: Promise<Map<string, DirectoryUser>> | null = null;

export function loadUserDirectory(): Promise<Map<string, DirectoryUser>> {
  if (!cache) {
    cache = listUsers({}).then(
      (res) => new Map(res.users.map((u) => [u.uid, u])),
      (err: unknown) => { cache = null; throw err; },
    );
  }
  return cache;
}

/** Test seam: forget the cached directory. */
export function resetUserDirectory(): void { cache = null; }

export type UserDirectory = {
  /** False until the first load settles (success or failure). */
  ready: boolean;
  entry: (uid: string | undefined | null) => DirectoryUser | undefined;
  /** The account's full name, or '' when it has none / is not known. Never the uid. */
  nameOf: (uid: string | undefined | null) => string;
  emailOf: (uid: string | undefined | null) => string | null;
};

/**
 * `enabled` false defers the load: a details sheet that has not been opened must not make a
 * directory call per ⋮ on the page. The cache means the first screen that needs names pays once.
 */
export function useUserDirectory(enabled = true): UserDirectory {
  const [map, setMap] = useState<Map<string, DirectoryUser> | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadUserDirectory().then(
      (m) => { if (live) { setMap(m); setReady(true); } },
      (err: unknown) => { console.error('[admin/people] directory load failed:', err); if (live) setReady(true); },
    );
    return () => { live = false; };
  }, [enabled]);
  const entry = (uid: string | undefined | null) => (uid ? map?.get(uid) : undefined);
  return {
    ready,
    entry,
    nameOf: (uid) => entry(uid)?.displayName ?? '',
    emailOf: (uid) => entry(uid)?.email ?? null,
  };
}

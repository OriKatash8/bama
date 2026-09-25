import { useState } from 'react';

type Row<T> = { item: T; leaving: boolean };

/**
 * Optimistic removal for a live list. `start` collapses rows at once, before
 * the write lands; `finish` (after the collapse) hides them; `revert` brings
 * them back when the write fails.
 *
 * Two things a plain "hidden ids" set gets wrong, handled here:
 * - A leaving row stays on screen, in its place, even if the live snapshot
 *   drops it mid-collapse (local writes update snapshots immediately), so the
 *   collapse always plays.
 * - A hidden id is forgotten once the live list no longer has it, so the same
 *   uid showing up again later (a new join request) is not still hidden.
 */
export function useVanishingList<T>(items: T[], idOf: (t: T) => string) {
  const [leaving, setLeaving] = useState<ReadonlyMap<string, { item: T; index: number }>>(new Map());
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());

  const present = new Set(items.map(idOf));
  // Adjusting state from props during render (React's documented pattern):
  // forget hidden ids the live list has already dropped.
  if ([...gone].some((id) => !present.has(id))) {
    setGone(new Set([...gone].filter((id) => present.has(id))));
  }

  const rows: Row<T>[] = items
    .filter((it) => !gone.has(idOf(it)))
    .map((it) => ({ item: it, leaving: leaving.has(idOf(it)) }));
  for (const [id, { item, index }] of leaving) {
    if (!present.has(id)) rows.splice(Math.min(index, rows.length), 0, { item, leaving: true });
  }

  function start(ids: string[]) {
    setLeaving((prev) => {
      const next = new Map(prev);
      for (const id of ids) {
        const index = items.findIndex((it) => idOf(it) === id);
        if (index >= 0) next.set(id, { item: items[index], index });
      }
      return next;
    });
  }

  function finish(id: string) {
    setLeaving((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setGone((prev) => new Set(prev).add(id));
  }

  function revert(ids: string[]) {
    setLeaving((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setGone((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
  }

  return { rows, start, finish, revert };
}

import { getVacantSlots, roleIdForCategory } from '@features/noticeboard/matching';
import type { ProjectRequest } from '@core/types/project';

/** The board's ordering, and — for `direct_only` — what it leaves out. */
export type NoticeSort = 'newest' | 'oldest' | 'direct_only';

/**
 * What the noticeboard actually shows: the role filter, the search box and the
 * sort applied in that order.
 *
 * `direct_only` is a FILTER, not an ordering. It used to be `direct_first`,
 * which floated notices addressed to this professional to the top and left the
 * whole open board underneath them — so a pro looking for the two projects sent
 * to them still had to scroll past everything else. It hides the rest now, and
 * orders what is left newest-first like the default does.
 *
 * Pure, and outside the screen, so this is testable without mounting the
 * dashboard and everything it subscribes to.
 */
export function visibleNotices(
  list: ProjectRequest[],
  opts: { roleFilter: string | null; search: string; sortBy: NoticeSort; currentUserId?: string },
): ProjectRequest[] {
  const { roleFilter, search, sortBy, currentUserId } = opts;
  let out = list;

  if (roleFilter) {
    out = out.filter((r) => getVacantSlots(r).some((s) => roleIdForCategory(s.category) === roleFilter));
  }

  const q = search.trim().toLowerCase();
  if (q) {
    out = out.filter((r) =>
      (r.title ?? '').toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q) ||
      (r.location ?? '').toLowerCase().includes(q),
    );
  }

  if (sortBy === 'direct_only') {
    out = out.filter((r) => r.targetProfessionalId === currentUserId);
  }

  return [...out].sort((a, b) =>
    sortBy === 'oldest'
      ? a.createdAt.seconds - b.createdAt.seconds
      : b.createdAt.seconds - a.createdAt.seconds,
  );
}

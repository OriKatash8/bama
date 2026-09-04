import type { ProjectRequest } from '@core/types/project';
import type { SentOfferEntry } from '@features/offers/hooks/useSentOffers';
import { getVacantSlots, professionalMatchesSlot, type RoleSkillEntry } from './matching';

/**
 * "Have I still got something to bid on here?" — the predicate that decides
 * whether a project stays on the noticeboard.
 *
 * It replaces writing `dismissedNotices` on every submitted offer. That write
 * hid the WHOLE project the moment a pro bid on ONE of its roles, permanently
 * and project-wide, so a pro who bid on photography could never see the sound
 * slot on the same project. `dismissedNotices` still exists and still means what
 * its name says — the explicit "not interested" action on a card — it is just no
 * longer written by the apply path.
 *
 * KNOWN LIMIT — resolution is per CATEGORY, not per capability.
 * `PriceOffer` has no `requiredCapability` field, and the noticeboard's submit
 * path drops it, so there is no way to tell "I bid on the drone slot" from "I bid
 * on the general slot" in the same category. On a project holding both, bidding
 * on either marks the category done and the project leaves the board with one
 * slot still vacant. Dormant until the role picker started emitting
 * capability-bearing slots (2026-09-04); recorded in
 * docs/known-issues-silent-failures.md with the schema change that would fix it.
 */

/**
 * projectId -> the categories this professional has already bid on.
 *
 * Offers of EVERY status count, including `rejected` and `removed`. Re-surfacing
 * a slot the client already turned down is noise, not an opportunity, and a
 * withdrawn offer is a decision too.
 *
 * `SentOfferEntry` already excludes individual offers that belong to a bundle
 * (useSentOffers filters on `!o.bundleId`); their categories arrive instead on
 * the bundle entry's `slots`, so nothing is missed by reading only this list.
 */
export function offeredCategoriesByProject(offers: SentOfferEntry[]): Map<string, Set<string>> {
  const byProject = new Map<string, Set<string>>();
  const add = (projectId: string, category: string) => {
    const set = byProject.get(projectId);
    if (set) set.add(category);
    else byProject.set(projectId, new Set([category]));
  };
  for (const entry of offers) {
    if (entry.kind === 'price') add(entry.data.projectId, entry.data.category);
    else for (const slot of entry.data.slots ?? []) add(entry.data.projectId, slot.category);
  }
  return byProject;
}

/**
 * Does this project still have a vacant slot this professional could bid on?
 *
 * `roleSkills === null` skips the skill half, for direct invites — the same
 * bypass useNoticeboard applies when a project targets this professional.
 */
export function hasUnofferedMatchingSlot(
  request: ProjectRequest,
  roleSkills: RoleSkillEntry[] | null,
  offeredCategories: Set<string> | undefined,
): boolean {
  return getVacantSlots(request).some(
    (slot) =>
      !offeredCategories?.has(slot.category) &&
      (roleSkills === null || professionalMatchesSlot(roleSkills, slot)),
  );
}

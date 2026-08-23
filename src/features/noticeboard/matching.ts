import { ROLE_TO_LEGACY_CATEGORY, getSpecializations, labelOf } from '@features/crew/data/categories';
import type { CrewRequestSlot, ProjectRequest } from '@core/types/project';

/**
 * Canonical capability-aware matching used by the noticeboard filter AND the
 * post-time no-match warning (single source of truth on the client).
 * A pure mirror lives in functions/src/matching.ts for onProjectCreate — keep in sync.
 */

export type RoleSkillEntry = { role: string; specializations: string[]; genres?: string[] };

const LEGACY_CATEGORY_TO_ROLE: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_TO_LEGACY_CATEGORY).map(([role, cat]) => [cat, role]),
);

/** Legacy crewSlot.category string → new RoleDef id (falls back to the input if unknown). */
export function roleIdForCategory(category: string): string {
  return LEGACY_CATEGORY_TO_ROLE[category] ?? category;
}

/** Vacant slots = requested minus filled (by category); preserves requiredCapability. */
export function getVacantSlots(request: ProjectRequest): CrewRequestSlot[] {
  return request.crewSlots
    .map((slot) => {
      const filled = (request.filledSlots ?? []).filter((f) => f.category === slot.category).length;
      return { ...slot, quantity: slot.quantity - filled };
    })
    .filter((slot) => slot.quantity > 0);
}

/**
 * Does a pro's roleSkills satisfy a single slot?
 * General slot (no requiredCapability) → needs 'general' for that role.
 * Specialized slot → needs that specialization for that role.
 */
export function professionalMatchesSlot(
  roleSkills: RoleSkillEntry[],
  slot: { category: string; requiredCapability?: string },
): boolean {
  const roleId = roleIdForCategory(slot.category);
  const entry = roleSkills.find((e) => e.role === roleId);
  if (!entry) return false;
  return slot.requiredCapability
    ? entry.specializations.includes(slot.requiredCapability)
    : entry.specializations.includes('general');
}

/** Does a pro match ANY vacant slot of a project? */
export function professionalMatchesProject(
  roleSkills: RoleSkillEntry[],
  request: ProjectRequest,
): boolean {
  return getVacantSlots(request).some((slot) => professionalMatchesSlot(roleSkills, slot));
}

/** Display label for a slot's required capability ('' if none / unknown). */
export function capabilityLabel(
  category: string,
  capId: string | undefined,
  lang: 'he' | 'en',
): string {
  if (!capId) return '';
  const spec = getSpecializations(roleIdForCategory(category)).find((s) => s.id === capId);
  return spec ? labelOf(spec, lang) : capId;
}

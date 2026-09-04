import { ROLE_TO_LEGACY_CATEGORY, getSpecializations, labelOf } from '@features/crew/data/categories';
import type { CrewRequestSlot, FilledSlot, ProjectRequest } from '@core/types/project';

/**
 * Canonical capability-aware matching used by the noticeboard filter AND the
 * post-time no-match warning (single source of truth on the client).
 * A pure mirror lives in functions/src/matching.ts for onProjectCreate — keep in sync.
 */

export type RoleSkillEntry = { role: string; specializations: string[] };

const LEGACY_CATEGORY_TO_ROLE: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_TO_LEGACY_CATEGORY).map(([role, cat]) => [cat, role]),
);

/** Legacy crewSlot.category string → new RoleDef id (falls back to the input if unknown). */
export function roleIdForCategory(category: string): string {
  return LEGACY_CATEGORY_TO_ROLE[category] ?? category;
}

/**
 * Two slots are the "same kind" iff same category AND same required capability.
 *
 * A general slot carries `requiredCapability: undefined`, NOT the string
 * 'general' — the two are different kinds here, so a slot written as 'general'
 * would never be matched by the general fill that satisfies it and would stay
 * vacant forever. Producers must normalize through `capabilityOf` in
 * `src/features/crew/data/categories.ts`.
 */
function sameSlotKind(
  a: { category: string; requiredCapability?: string },
  b: { category: string; requiredCapability?: string },
): boolean {
  return a.category === b.category && (a.requiredCapability ?? undefined) === (b.requiredCapability ?? undefined);
}

/**
 * Vacant slots = requested minus filled, matched by (category + requiredCapability).
 * A drone slot is only consumed by a drone-attributed fill; a general fill only
 * consumes a general slot. Preserves requiredCapability on the returned slots.
 */
export function getVacantSlots(request: {
  crewSlots: CrewRequestSlot[];
  filledSlots?: FilledSlot[];
}): CrewRequestSlot[] {
  return request.crewSlots
    .map((slot) => {
      const filled = (request.filledSlots ?? []).filter((f) => sameSlotKind(f, slot)).length;
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

/**
 * When a pro is accepted for `category`, which capability slot do they fill?
 * Among still-vacant (category, cap) slots, pick the most SPECIFIC one the pro
 * matches (specialized before general) so a drone pro consumes the drone slot,
 * not the general one. Returns its requiredCapability (undefined = general).
 *
 * `undefined` here is the SAME value a general slot must be written with — see
 * `capabilityOf` in `src/features/crew/data/categories.ts`. The two ends have to
 * agree or sameSlotKind never matches them up.
 */
export function assignFilledCapability(
  crewSlots: CrewRequestSlot[],
  filledSlots: FilledSlot[],
  roleSkills: RoleSkillEntry[],
  category: string,
): string | undefined {
  const vacant = getVacantSlots({ crewSlots, filledSlots })
    .filter((s) => s.category === category)
    .sort((a, b) => (b.requiredCapability ? 1 : 0) - (a.requiredCapability ? 1 : 0));
  const match = vacant.find((s) => professionalMatchesSlot(roleSkills, s));
  return match?.requiredCapability;
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

// MIRROR of src/features/noticeboard/matching.ts (+ seedRoleSkills from
// src/features/profile/utils/roleSkills.ts) — KEEP IN SYNC.
// Pure, dependency-free so onProjectCreate notifies exactly the pros the
// in-app noticeboard shows ("notified == visible").

export type RoleSkillEntry = { role: string; specializations: string[] };
export type Slot = { category: string; quantity: number; requiredCapability?: string };
export type FilledLike = { category: string; requiredCapability?: string };
export type ProjectLike = { crewSlots?: Slot[]; filledSlots?: FilledLike[] };

const ROLE_TO_LEGACY_CATEGORY: Record<string, string> = {
  videographer: 'Video Photographer',
  photographer: 'Still Photographer',
  editor: 'Editor',
  graphic_designer: 'Graphic Designer',
  social_media: 'Social Media',
  studio_audio: 'Studio & Audio',
  sound: 'Sound Recordist',
  lighting: 'Lighting Tech',
};
const LEGACY_CATEGORY_TO_ROLE: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_TO_LEGACY_CATEGORY).map(([role, cat]) => [cat, role]),
);

export function roleIdForCategory(category: string): string {
  return LEGACY_CATEGORY_TO_ROLE[category] ?? category;
}

export function seedRoleSkills(
  roleSkills: RoleSkillEntry[] | undefined,
  skills: { category: string }[] | undefined,
): RoleSkillEntry[] {
  if (roleSkills && roleSkills.length > 0) return roleSkills;
  return (skills ?? [])
    .map((s) => LEGACY_CATEGORY_TO_ROLE[s.category] ?? s.category)
    .filter((role) => role in ROLE_TO_LEGACY_CATEGORY)
    .map((role) => ({ role, specializations: ['general'] }));
}

/** Two slots are the "same kind" iff same category AND same required capability. */
function sameSlotKind(a: FilledLike, b: FilledLike): boolean {
  return a.category === b.category && (a.requiredCapability ?? undefined) === (b.requiredCapability ?? undefined);
}

export function getVacantSlots(project: ProjectLike): Slot[] {
  const crewSlots = project.crewSlots ?? [];
  const filled = project.filledSlots ?? [];
  return crewSlots
    .map((slot) => ({
      ...slot,
      quantity: slot.quantity - filled.filter((f) => sameSlotKind(f, slot)).length,
    }))
    .filter((slot) => slot.quantity > 0);
}

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

export function professionalMatchesAnyVacantSlot(
  roleSkills: RoleSkillEntry[],
  vacantSlots: { category: string; requiredCapability?: string }[],
): boolean {
  return vacantSlots.some((slot) => professionalMatchesSlot(roleSkills, slot));
}

/** Which capability slot a fill consumes — mirror of the client's
 *  assignFilledCapability. Prefers capability-specific vacancies first. */
export function assignFilledCapability(
  crewSlots: Slot[],
  filledSlots: FilledLike[],
  roleSkills: RoleSkillEntry[],
  category: string,
): string | undefined {
  const vacant = getVacantSlots({ crewSlots, filledSlots })
    .filter((s) => s.category === category)
    .sort((a, b) => (b.requiredCapability ? 1 : 0) - (a.requiredCapability ? 1 : 0));
  const match = vacant.find((s) => professionalMatchesSlot(roleSkills, s));
  return match?.requiredCapability;
}

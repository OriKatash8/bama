import { ROLE_TO_LEGACY_CATEGORY, ROLE_BY_ID } from '@features/crew/data/categories';

export type RoleSkillEntry = { role: string; specializations: string[] };

/**
 * Seed roleSkills from the deprecated legacy skills[] (reverse map) so existing pros
 * — who have skills but no roleSkills until their next save — still render/edit their
 * skills instead of appearing empty. Behavior-preserving bridge until the coordinated
 * phase backfills roleSkills for everyone.
 */
export function seedRoleSkills(
  roleSkills: RoleSkillEntry[] | undefined,
  skills: { category: string }[] | undefined,
): RoleSkillEntry[] {
  if (roleSkills && roleSkills.length > 0) return roleSkills;
  const legacyToRole = Object.fromEntries(
    Object.entries(ROLE_TO_LEGACY_CATEGORY).map(([role, cat]) => [cat, role]),
  );
  return (skills ?? [])
    .map((s) => legacyToRole[s.category] ?? s.category)
    .filter((role) => !!ROLE_BY_ID[role])
    .map((role) => ({ role, specializations: ['general'] }));
}

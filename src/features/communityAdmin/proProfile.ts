/**
 * Whether a join requester has a usable professional profile, so the owner can
 * weigh the request. DERIVED from the profile data the owner's console already
 * fetches for each person (usePeople), not a stored flag.
 *
 * Deliberately not `proProfileCompleted`: that flag belongs to the forced
 * first-time pro-profile completion work, which is not built, so it is undefined
 * for everyone. This asks the same question of the data itself: a display name
 * and at least one role.
 */
export type ProProfileMark = 'ready' | 'missing' | 'unknown';

export function hasUsableProProfile(p: { name: string; roleIds: readonly string[] }): boolean {
  return p.name.trim().length > 0 && p.roleIds.length > 0;
}

/**
 * Demo accounts (Apple App Review) live on their own "side": demo users see only
 * demo users, projects, listings and communities, and real users never see them.
 *
 * The server enforces every way of REACHING someone (firestore.rules oneSide(),
 * functions/src/demo.ts). This file only decides what a list SHOWS — rules
 * cannot hide a document per viewer without breaking the list queries.
 *
 * Source: `config/demoAccounts`, written only by scripts/demo-accounts.mjs.
 * Missing doc ⇒ nobody is demo ⇒ every predicate here is true.
 */

/** Kept in sync with SYSTEM_USER_ID in src/core/constants/system.ts. */
const SYSTEM_USER_ID = 'bama-system';

export type DemoConfig = {
  uids: string[];
  neutralUids: string[];
  communityIds: string[];
};

export const EMPTY_DEMO_CONFIG: DemoConfig = { uids: [], neutralUids: [], communityIds: [] };

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function parseDemoConfig(data: Record<string, unknown> | null | undefined): DemoConfig {
  if (!data) return EMPTY_DEMO_CONFIG;
  return {
    uids: strings(data.uids),
    neutralUids: strings(data.neutralUids),
    communityIds: strings(data.communityIds),
  };
}

function isNeutral(cfg: DemoConfig, uid: string): boolean {
  return uid === SYSTEM_USER_ID || cfg.neutralUids.includes(uid);
}

/** Whether `other` belongs in `me`'s lists. Neutral uids (admins, BAMA) on either end always pass. */
export function isSameSide(cfg: DemoConfig, me: string | null | undefined, other: string | null | undefined): boolean {
  if (!me || !other) return true;
  if (isNeutral(cfg, me) || isNeutral(cfg, other)) return true;
  return cfg.uids.includes(me) === cfg.uids.includes(other);
}

/**
 * Courses are shown to App Review demo accounts only (as demo content): a demo account sees the
 * `demoOnly` courses, a real account sees none, and admins and BAMA see all.
 */
export function isCourseOnSide(cfg: DemoConfig, me: string | null | undefined, demoOnly: boolean | undefined): boolean {
  if (!me) return false;
  if (isNeutral(cfg, me)) return true;
  return cfg.uids.includes(me) && demoOnly === true;
}

/** Whether `me` gets the Courses tab at all: demo accounts, admins and BAMA. */
export function canSeeCourses(cfg: DemoConfig, me: string | null | undefined): boolean {
  if (!me) return false;
  return isNeutral(cfg, me) || cfg.uids.includes(me);
}

/** A demo community: owned by a demo account (automatic), or listed in communityIds. */
export function isDemoCommunity(cfg: DemoConfig, communityId: string, ownerId?: string | null): boolean {
  return cfg.communityIds.includes(communityId) || (!!ownerId && cfg.uids.includes(ownerId));
}

/** Whether a community belongs in `me`'s discovery list. */
export function isCommunityOnSide(cfg: DemoConfig, me: string | null | undefined, communityId: string, ownerId?: string | null): boolean {
  if (!me || isNeutral(cfg, me)) return true;
  return cfg.uids.includes(me) === isDemoCommunity(cfg, communityId, ownerId);
}

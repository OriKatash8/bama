import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Demo accounts (Apple App Review) live on their own "side": they may reach each
 * other and nobody else, and nobody else may reach them. firestore.rules holds the
 * same logic in `oneSide()` — keep the two in step.
 *
 * `config/demoAccounts` is written only by scripts/demo-accounts.mjs (Admin SDK):
 *   uids         the demo accounts
 *   neutralUids  admins (plus bama-system, always) — on neither side, so never refused
 *   communityIds communities that belong to the demo side
 *
 * A missing doc means nobody is demo, and every check passes: production behaves
 * exactly as before until the doc is written.
 *
 * Read FRESH on every call, never cached. A cached copy would let an instance that
 * started before the seed wrote the doc fan a demo project out to real pros.
 */

/** Kept in sync with SYSTEM_USER_ID in functions/src/system/index.ts. */
const SYSTEM_USER_ID = 'bama-system';

export interface DemoConfig {
  uids: Set<string>;
  neutralUids: Set<string>;
  communityIds: Set<string>;
}

const EMPTY: DemoConfig = { uids: new Set(), neutralUids: new Set(), communityIds: new Set() };

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function parseDemoConfig(data: Record<string, unknown> | undefined): DemoConfig {
  if (!data) return EMPTY;
  return {
    uids: new Set(strings(data.uids)),
    neutralUids: new Set(strings(data.neutralUids)),
    communityIds: new Set(strings(data.communityIds)),
  };
}

export async function readDemoConfig(): Promise<DemoConfig> {
  const snap = await admin.firestore().doc('config/demoAccounts').get();
  return parseDemoConfig(snap.exists ? snap.data() : undefined);
}

function isNeutral(cfg: DemoConfig, uid: string): boolean {
  return uid === SYSTEM_USER_ID || cfg.neutralUids.has(uid);
}

/** Every non-neutral uid lies on one side. Neutral uids (admins, bama-system) are ignored. */
export function oneSide(cfg: DemoConfig, uids: Iterable<string>): boolean {
  let demo = 0;
  let real = 0;
  for (const uid of uids) {
    if (!uid || isNeutral(cfg, uid)) continue;
    if (cfg.uids.has(uid)) demo++;
    else real++;
  }
  return demo === 0 || real === 0;
}

export function sameSide(cfg: DemoConfig, a: string, b: string): boolean {
  return oneSide(cfg, [a, b]);
}

/** Whether `uid` may see a community: demo communities for demo users only, and the reverse. */
export function communityOnSide(cfg: DemoConfig, uid: string, communityId: string): boolean {
  if (isNeutral(cfg, uid)) return true;
  return cfg.uids.has(uid) === cfg.communityIds.has(communityId);
}

/**
 * Refuse a callable that would connect two sides. `failed-precondition` with a
 * fixed message, so the client and the probes can tell it from every other refusal.
 */
export async function assertSameSide(a: string, b: string): Promise<void> {
  const cfg = await readDemoConfig();
  if (!sameSide(cfg, a, b)) throw new HttpsError('failed-precondition', 'demo-isolation');
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { communityOnSide, oneSide, parseDemoConfig, sameSide } from '../demo';

const cfg = parseDemoConfig({ uids: ['d1', 'd2'], neutralUids: ['adm'], communityIds: ['dc'] });

describe('sameSide / oneSide (mirror of firestore.rules oneSide)', () => {
  it('allows real↔real and demo↔demo', () => {
    expect(sameSide(cfg, 'r1', 'r2')).toBe(true);
    expect(sameSide(cfg, 'd1', 'd2')).toBe(true);
  });
  it('refuses demo↔real, both directions', () => {
    expect(sameSide(cfg, 'd1', 'r1')).toBe(false);
    expect(sameSide(cfg, 'r1', 'd1')).toBe(false);
    expect(oneSide(cfg, ['d1', 'd2', 'r1'])).toBe(false);
  });
  it('treats admins and bama-system as neither side', () => {
    expect(sameSide(cfg, 'd1', 'adm')).toBe(true);
    expect(sameSide(cfg, 'r1', 'bama-system')).toBe(true);
    expect(oneSide(cfg, ['d1', 'adm', 'bama-system', 'd2'])).toBe(true);
  });
  it('with the doc absent, allows everything', () => {
    const none = parseDemoConfig(undefined);
    expect(sameSide(none, 'd1', 'r1')).toBe(true);
  });
  it('communities follow the caller\'s side; admins see all', () => {
    expect(communityOnSide(cfg, 'd1', 'dc')).toBe(true);
    expect(communityOnSide(cfg, 'r1', 'dc')).toBe(false);
    expect(communityOnSide(cfg, 'd1', 'rc')).toBe(false);
    expect(communityOnSide(cfg, 'adm', 'dc')).toBe(true);
  });
});

/** Wiring: each guard is present, and before the thing it protects. */
const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('wiring', () => {
  it('reads the config FRESH — no module-level cache', () => {
    const demo = src('demo.ts');
    const read = demo.slice(demo.indexOf('export async function readDemoConfig'));
    expect(read).toMatch(/admin\.firestore\(\)\.doc\('config\/demoAccounts'\)\.get\(\)/);
    expect(demo).not.toMatch(/\blet\s+\w*cache/i);
    expect(demo).not.toMatch(/Date\.now\(\)/);
  });
  it('hire refuses across sides before writing anything', () => {
    const hire = src('lifecycle/hire.ts');
    const load = hire.slice(hire.indexOf('async function loadAndEnforce'));
    const guard = load.indexOf('await assertSameSide(uid, proId)');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(load.indexOf('readConfig()'));
  });
  it('onProjectCreate notifies only the client\'s side', () => {
    const t = src('notifications/triggers.ts');
    const fn = t.slice(t.indexOf('export const onProjectCreate'));
    const read = fn.indexOf('await readDemoConfig()');
    const skip = fn.indexOf("if (!sameSide(demo, clientId ?? '', uid)) return;");
    expect(read).toBeGreaterThan(-1);
    expect(skip).toBeGreaterThan(read);
    expect(skip).toBeLessThan(fn.indexOf('createNotification('));
  });
  it('rejectCandidate refuses before the system DM', () => {
    const c = src('lifecycle/candidates.ts');
    const fn = c.slice(c.indexOf('export const rejectCandidate'));
    expect(fn.indexOf('await assertSameSide(uid, proId)')).toBeGreaterThan(-1);
    expect(fn.indexOf('await assertSameSide(uid, proId)')).toBeLessThan(fn.indexOf('sendBamaSystemDM('));
  });
  it('createPaymentRequest refuses before writing the request', () => {
    const r = src('lifecycle/repricing.ts');
    const fn = r.slice(r.indexOf('export const createPaymentRequest'));
    expect(fn.indexOf('await assertSameSide(uid, toUserId)')).toBeGreaterThan(-1);
    expect(fn.indexOf('await assertSameSide(uid, toUserId)')).toBeLessThan(fn.indexOf('.set('));
  });
  it('respondToEngagementEnd refuses after the client check', () => {
    const c = src('lifecycle/completion.ts');
    const fn = c.slice(c.indexOf('export const respondToEngagementEnd'));
    const g = fn.indexOf('await assertSameSide(uid, professionalId)');
    expect(g).toBeGreaterThan(fn.indexOf("'Only the client can respond'"));
    expect(g).toBeLessThan(fn.indexOf('feeRef(projectId, professionalId)'));
  });
  it('getContactPhone refuses before reading the number', () => {
    const c = src('lifecycle/contact.ts');
    const g = c.indexOf('await assertSameSide(uid, userId)');
    expect(g).toBeGreaterThan(-1);
    expect(g).toBeLessThan(c.indexOf('/private/contact`).get()'));
  });
  it('getCommunityInvite refuses a community on the other side', () => {
    const c = src('communities/invites.ts');
    const fn = c.slice(c.indexOf('export const getCommunityInvite'));
    const g = fn.indexOf('communityOnSide(await readDemoConfig(), uid, found.communityId)');
    expect(g).toBeGreaterThan(-1);
    expect(g).toBeLessThan(fn.indexOf('authedInviteBody('));
  });
});

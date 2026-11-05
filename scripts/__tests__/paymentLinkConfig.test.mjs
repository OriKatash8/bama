// node --test scripts/__tests__/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTesters, planLinkConfig } from '../lib/paymentLinkConfig.mjs';

const UID = 'AbCdEfGhIjKlMnOpQrStUvWxYz12';
const pricing = (paymentProvider) => ({ feePercent: 3, ...(paymentProvider ? { paymentProvider } : {}) });
const priv = (o = {}) => ({ paymentTestUids: [], ...o });

test('parseTesters: absent -> null; trims; rejects junk, duplicates and too many', () => {
  assert.equal(parseTesters(undefined), null);
  assert.deepEqual(parseTesters(` ${UID} , ${UID}x `), [UID, `${UID}x`]);
  assert.throws(() => parseTesters('not a uid'), /does not look like/);
  assert.throws(() => parseTesters(`${UID},${UID}`), /duplicate/);
  assert.throws(() => parseTesters(Array.from({ length: 21 }, (_, i) => `u${String(i).padStart(12, '0')}`).join(',')), /at most/);
});

test('switching on for one tester writes the private doc and the provider', () => {
  const p = planLinkConfig({ provider: 'grow_link', audience: 'testers', testers: [UID] }, { pricing: pricing('none'), priv: priv() });
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.pricingWrite, { paymentProvider: 'grow_link' });
  assert.deepEqual(p.privWrite, { paymentTestUids: [UID] });
  assert.deepEqual(p.after, { paymentProvider: 'grow_link', paymentLinkAudience: 'testers', paymentTestUids: [UID] });
});

test('grow_link with no testers and the testers audience is refused (on for nobody)', () => {
  const p = planLinkConfig({ provider: 'grow_link' }, { pricing: pricing('none'), priv: priv() });
  assert.match(p.errors.join(), /at least one tester/);
});

test('audience all is refused without --allow-all, accepted with it', () => {
  assert.match(planLinkConfig({ provider: 'grow_link', audience: 'all' }, { pricing: pricing('none'), priv: priv() }).errors.join(), /--allow-all/);
  const ok = planLinkConfig({ provider: 'grow_link', audience: 'all', allowAll: true }, { pricing: pricing('none'), priv: priv() });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.privWrite, { paymentLinkAudience: 'all' });
});

test('switching off needs nothing else and writes only the provider', () => {
  const p = planLinkConfig({ provider: 'none' }, { pricing: pricing('grow_link'), priv: priv({ paymentTestUids: [UID] }) });
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.pricingWrite, { paymentProvider: 'none' });
  assert.equal(p.privWrite, null);
});

test('a missing provider field reads as none; setting none again is a no-op', () => {
  const p = planLinkConfig({ provider: 'none' }, { pricing: pricing(), priv: null });
  assert.equal(p.pricingWrite, null);
  assert.equal(p.privWrite, null);
});

test('refuses a provider this script does not own (grow / fake / fake_link), and never sets fake_link', () => {
  assert.match(planLinkConfig({ provider: 'none' }, { pricing: pricing('grow'), priv: priv() }).errors.join(), /only moves between/);
  assert.match(planLinkConfig({ provider: 'fake_link' }, { pricing: pricing('none'), priv: priv() }).errors.join(), /--provider must be one of/);
  assert.match(planLinkConfig({ provider: 'stripe' }, { pricing: pricing('none'), priv: priv() }).errors.join(), /--provider must be one of/);
});

test('a missing private doc gets the safe defaults written explicitly on first switch-on', () => {
  const p = planLinkConfig({ provider: 'grow_link', testers: [UID] }, { pricing: pricing('none'), priv: null });
  assert.deepEqual(p.privWrite, { paymentTestUids: [UID] });
});

test('only the three keys are ever written', () => {
  const p = planLinkConfig({ provider: 'grow_link', audience: 'all', allowAll: true, testers: [UID] }, { pricing: pricing('none'), priv: priv() });
  assert.deepEqual(Object.keys(p.pricingWrite), ['paymentProvider']);
  assert.deepEqual(Object.keys(p.privWrite).sort(), ['paymentLinkAudience', 'paymentTestUids']);
});

test('a bare run and a wrong-target run are refused before anything else', async () => {
  const { spawnSync } = await import('node:child_process');
  const run = (...a) => spawnSync('node', ['scripts/admin-set-payment-link-config.mjs', ...a], { encoding: 'utf8', timeout: 20000 });
  assert.equal(run().status, 2);
  assert.equal(run('--emulator', '--provider', 'none').status, 2);
});

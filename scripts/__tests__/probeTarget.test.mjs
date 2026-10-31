// node --test scripts/__tests__/probeTarget.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateProbeTarget } from '../lib/probeTarget.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ev = (argv, allow, env = {}, extra = {}) => evaluateProbeTarget({ argv, env, allow, script: 'scripts/x.mjs', ...extra });

test('no flag and both flags are refused, for every kind of probe', () => {
  for (const allow of ['emulator', 'prod', 'either']) {
    assert.equal(ev([], allow).ok, false, allow);
    assert.match(ev([], allow).message, /no default/);
    assert.equal(ev(['--emulator', '--prod'], allow).ok, false, allow);
  }
});

test('single-target probes refuse the other flag', () => {
  assert.equal(ev(['--prod'], 'emulator').ok, false);
  assert.equal(ev(['--emulator'], 'prod').ok, false);
  assert.equal(ev(['--emulator'], 'emulator').target, 'emulator');
  assert.equal(ev(['--prod'], 'prod').target, 'prod');
});

test('--prod refuses to run while an emulator host is exported', () => {
  for (const k of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
    const r = ev(['--prod'], 'prod', { [k]: '127.0.0.1:1' });
    assert.equal(r.ok, false, k);
    assert.match(r.message, new RegExp(k));
  }
});

test('env-driven probes: --emulator needs FIRESTORE_EMULATOR_HOST', () => {
  assert.equal(ev(['--emulator'], 'either', {}, { envDriven: true }).ok, false);
  assert.equal(ev(['--emulator'], 'either', { FIRESTORE_EMULATOR_HOST: 'x' }, { envDriven: true }).ok, true);
  assert.equal(ev(['--emulator'], 'either', {}, { envDriven: false }).ok, true);
});

test('EVERY probe script is guarded, and a bare run exits 2 before touching anything', () => {
  const probes = readdirSync(join(ROOT, 'scripts')).filter((f) => /^probe-.*\.mjs$/.test(f));
  assert.ok(probes.length >= 40, `found ${probes.length}`);
  for (const f of probes) {
    const src = readFileSync(join(ROOT, 'scripts', f), 'utf8');
    assert.match(src, /requireEmulator\.mjs|requireProd\.mjs|requireProbeTarget\(/, `${f} has no target guard`);
    const r = spawnSync(process.execPath, ['--no-warnings', join(ROOT, 'scripts', f)], {
      env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 20000,
    });
    assert.equal(r.status, 2, `${f}: expected exit 2, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /REFUSING TO RUN/, f);
    assert.match(r.stderr, /--emulator|--prod/, f);
  }
});

test('a wrong-target flag is refused by the single-target probes (sampled)', () => {
  const run = (f, flag) => spawnSync(process.execPath, ['--no-warnings', join(ROOT, 'scripts', f), flag], {
    env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 20000,
  });
  assert.equal(run('probe-payment-lockdown-prod.mjs', '--emulator').status, 2);
  assert.equal(run('probe-payments-emulator.mjs', '--prod').status, 2);
});

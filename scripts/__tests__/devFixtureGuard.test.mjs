// node --test scripts/__tests__/devFixtureGuard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (args, env) =>
  spawnSync(process.execPath, ['--no-warnings', join(ROOT, 'scripts/dev-invite-fixture.mjs'), ...args], {
    env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', timeout: 20000,
  });

test('the fixture wipes data, so it refuses without BOTH emulator hosts', () => {
  for (const env of [{}, { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }, { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }]) {
    const r = run([], env);
    assert.equal(r.status, 2, JSON.stringify(env));
    assert.match(r.stderr, /REFUSING TO RUN/);
  }
});

test('...refuses a project that is not a demo- project, even against local emulators', () => {
  const r = run(['--project', 'bama-af0a0'], { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /REFUSING TO RUN/);
});

test('...and refuses emulator hosts that are not local', () => {
  const r = run([], { FIRESTORE_EMULATOR_HOST: 'firestore.example.com:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /must be local/);
});

test('the app\'s emulator switch is dev-only, opt-in, and points at a demo- project', () => {
  const src = readFileSync(join(ROOT, 'src/core/firebase/config.ts'), 'utf8');
  assert.match(src, /const USE_EMULATORS = __DEV__ && process\.env\.EXPO_PUBLIC_USE_EMULATORS === '1';/);
  assert.match(src, /projectId: 'demo-bama'/);
  assert.match(src, /if \(USE_EMULATORS\) \{[\s\S]*connectAuthEmulator[\s\S]*connectFirestoreEmulator[\s\S]*connectFunctionsEmulator/);
  // The production config is the default branch.
  assert.match(src, /:\s*\{\s*apiKey: process\.env\.EXPO_PUBLIC_FIREBASE_API_KEY/);
});

test('the test accounts\' password is self-evidently not a secret, overridable, and says it only works on the emulator', () => {
  const src = readFileSync(join(ROOT, 'scripts/dev-invite-fixture.mjs'), 'utf8');
  assert.match(src, /const PASSWORD = process\.env\.FIXTURE_PASSWORD \?\? 'emulator-only-not-a-secret';/);
  assert.match(src, /Not a secret: these accounts exist only in the local Auth emulator/);
  assert.doesNotMatch(src, /Invite-test-1/);
  // The emulator wants 6+ characters; the default must satisfy it.
  assert.ok('emulator-only-not-a-secret'.length >= 6);
});

// node --test scripts/__tests__/functionsLedger.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateLedger, gitBlobSha, gitTreeSha, recordFunctions, serializeLedger, treeShaOfDir } from '../lib/functionsLedger.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

test('gitBlobSha agrees with `git hash-object`', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blob-'));
  for (const text of ['', 'hello\n', 'שלום עולם\n', 'x'.repeat(100000)]) {
    writeFileSync(join(dir, 'f'), text);
    assert.equal(gitBlobSha(Buffer.from(text)), execFileSync('git', ['hash-object', join(dir, 'f')], { encoding: 'utf8' }).trim());
  }
});

test('gitTreeSha agrees with real git on a nested tree, including git\'s directory ordering and an executable file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tree-'));
  const put = (p, text) => { mkdirSync(dirname(join(dir, 'src', p)), { recursive: true }); writeFileSync(join(dir, 'src', p), text); };
  // "a.b" sorts before the directory "a" (which compares as "a/") in git, though "a" < "a.b" as plain strings.
  put('a.b', '1'); put('a/z.ts', '2'); put('a/inner/y.ts', '3'); put('b.ts', '4'); put('run.sh', '#!/bin/sh\n'); put('__tests__/t.ts', '5');
  chmodSync(join(dir, 'src', 'run.sh'), 0o755);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  const expected = execFileSync('git', ['write-tree', '--prefix=src/'], { cwd: dir, encoding: 'utf8' }).trim();
  assert.equal(treeShaOfDir(join(dir, 'src')), expected);
});

test('and with the REAL repo: functions/src at HEAD hashes to the tree git reports (a working tree identical to HEAD)', () => {
  const dirty = git('status', '--porcelain', '--', 'functions/src');
  if (dirty) return; // uncommitted edits in functions/src: nothing to compare
  assert.equal(treeShaOfDir(join(ROOT, 'functions/src')), git('rev-parse', 'HEAD:functions/src'));
});

test('any change, rename or mode flip changes the hash', () => {
  const base = new Map([['a.ts', { content: Buffer.from('1') }], ['d/b.ts', { content: Buffer.from('2') }]]);
  const sha = gitTreeSha(base);
  assert.notEqual(gitTreeSha(new Map([['a.ts', { content: Buffer.from('1!') }], ['d/b.ts', { content: Buffer.from('2') }]])), sha);
  assert.notEqual(gitTreeSha(new Map([['a2.ts', { content: Buffer.from('1') }], ['d/b.ts', { content: Buffer.from('2') }]])), sha);
  assert.notEqual(gitTreeSha(new Map([['a.ts', { content: Buffer.from('1'), executable: true }], ['d/b.ts', { content: Buffer.from('2') }]])), sha);
  assert.equal(gitTreeSha(new Map([...base].reverse())), sha, 'insertion order must not matter');
});

const dep = (name, updateTime = 'T1', treeSha = 'aaaaaaaaaaaa') => ({ name, region: 'r', generation: 2, updateTime, treeSha });
const entry = (updateTime = 'T1', treeSha = 'aaaaaaaaaaaa') => ({ updateTime, treeSha });

test('everything recorded and unchanged: no problems', () => {
  const r = evaluateLedger({ deployed: [dep('f'), dep('g')], ledger: { f: entry(), g: entry() } });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.recorded.sort(), ['f', 'g']);
});

test('THE 09-30 CASE: a function that is live and in no recorded deploy is DRIFT', () => {
  const r = evaluateLedger({ deployed: [dep('f'), dep('callClaude', '2026-09-30T21:12:36Z')], ledger: { f: entry() } });
  assert.deepEqual(r.problems.map((p) => [p.kind, p.name]), [['unrecorded-new', 'callClaude']]);
  assert.match(r.problems[0].message, /live since 2026-09-30T21:12:36Z and in no recorded deploy/);
});

test('THE 10-01 CASE: redeploying identical code is still an unrecorded deploy (the updateTime moved)', () => {
  const r = evaluateLedger({ deployed: [dep('f', 'T2')], ledger: { f: entry('T1') } });
  assert.deepEqual(r.problems.map((p) => p.kind), ['unrecorded-update']);
});

test('changed source with an unchanged updateTime is flagged, as is a function whose source cannot be read', () => {
  assert.deepEqual(evaluateLedger({ deployed: [dep('f', 'T1', 'bbbbbbbbbbbb')], ledger: { f: entry() } }).problems.map((p) => p.kind), ['source-differs']);
  assert.deepEqual(evaluateLedger({ deployed: [dep('f', 'T1', null)], ledger: { f: entry() } }).problems.map((p) => p.kind), ['source-unreadable']);
});

test('a deleted function still in the ledger is flagged until its deletion is recorded', () => {
  const r = evaluateLedger({ deployed: [dep('f')], ledger: { f: entry(), resolveCommunityInvite: entry() } });
  assert.deepEqual(r.problems.map((p) => [p.kind, p.name]), [['recorded-but-gone', 'resolveCommunityInvite']]);
});

test('recordFunctions adds, updates and (for a function no longer deployed) removes, and never records unreadable source', () => {
  const ledger = { f: entry('T0', 'old'), gone: entry() };
  const out = recordFunctions({ ledger, deployed: [dep('f', 'T2', 'new'), dep('n')], only: ['f', 'n', 'gone'], how: 'deploy', note: 'n', today: '2026-10-06' });
  assert.deepEqual(out.changed.map((c) => `${c.name}:${c.action}`).sort(), ['f:updated', 'gone:removed', 'n:added']);
  assert.equal(out.ledger.f.updateTime, 'T2');
  assert.equal(out.ledger.f.how, 'deploy');
  assert.equal('gone' in out.ledger, false);
  assert.throws(() => recordFunctions({ ledger: {}, deployed: [dep('x', 'T', null)], only: ['x'], how: 'deploy', note: 'n', today: 'd' }), /refusing to record/);
  // Not mentioned in `only`: untouched.
  assert.deepEqual(recordFunctions({ ledger, deployed: [dep('f')], only: [], how: 'deploy', note: 'n', today: 'd' }).ledger, ledger);
});

test('serializeLedger sorts keys so the file diffs cleanly', () => {
  const text = serializeLedger({ b: entry(), a: entry() }, { _readme: 'x' });
  assert.deepEqual(Object.keys(JSON.parse(text).functions), ['a', 'b']);
  assert.ok(text.endsWith('\n'));
});

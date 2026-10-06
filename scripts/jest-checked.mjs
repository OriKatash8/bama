#!/usr/bin/env node
/**
 * Runs Jest and makes a suite that fails to LOAD impossible to miss.
 *
 *   npm run test:checked [-- <jest args>]
 *
 * WHY. A suite that fails to load (a module error, a crashed worker) runs none of its tests, so
 * the run has silently LESS coverage; the only visible sign is a lower test count. That is worse
 * than a failing assertion, and on 2026-10-06 src/core/stores/__tests__/authStore.test.ts did it
 * once and the reason was lost, because the output had been filtered. So this always writes
 * Jest's full JSON, reports load failures apart from failed assertions with the real error
 * text, warns when fewer tests ran than last time, and keeps a copy of any bad run.
 *
 * Files (gitignored): .jest-last-run.json (every run), .jest-failures/<time>.json (bad runs only).
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LAST = join(ROOT, '.jest-last-run.json');

/** A suite "failed to load" when it reports an error but ran no assertions at all. */
export const failedToLoad = (suite) =>
  suite.status === 'failed' && (suite.assertionResults ?? []).length === 0 && Boolean(suite.message || suite.failureMessage);

/** Pure: what a Jest --json result means, and whether to warn about coverage. */
export function summarize(json, previousTotalTests = null) {
  const suites = json.testResults ?? [];
  const loadFailures = suites.filter(failedToLoad).map((s) => ({ file: s.name, message: String(s.message ?? s.failureMessage ?? '') }));
  const failedAssertions = suites.flatMap((s) => (s.assertionResults ?? []).filter((a) => a.status === 'failed').map((a) => ({ file: s.name, title: a.fullName })));
  const fewerThanBefore = previousTotalTests !== null && json.numTotalTests < previousTotalTests ? previousTotalTests - json.numTotalTests : 0;
  return {
    totalSuites: json.numTotalTestSuites,
    totalTests: json.numTotalTests,
    loadFailures,
    failedAssertions,
    fewerThanBefore,
    ok: Boolean(json.success) && loadFailures.length === 0,
  };
}

function main() {
  const previous = existsSync(LAST) ? safeTotal(LAST) : null;
  const run = spawnSync('npx', ['jest', '--json', `--outputFile=${LAST}`, ...process.argv.slice(2)], { cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'] });
  if (!existsSync(LAST)) { console.error('\njest-checked: Jest wrote no JSON; it crashed before finishing.'); process.exit(run.status || 1); }
  const s = summarize(JSON.parse(readFileSync(LAST, 'utf8')), previous);
  console.log(`\njest-checked: ${s.totalSuites} suites, ${s.totalTests} tests, ${s.failedAssertions.length} failed assertion(s), ${s.loadFailures.length} suite(s) that FAILED TO LOAD`);
  if (s.fewerThanBefore) console.log(`jest-checked: WARNING ${s.fewerThanBefore} fewer tests ran than the last run (${previous}). Tests deleted, or a suite that did not load?`);
  for (const f of s.loadFailures) console.log(`\nFAILED TO LOAD (none of its tests ran): ${f.file}\n${f.message.slice(0, 1200)}`);
  if (!s.ok || s.fewerThanBefore) {
    const dir = join(ROOT, '.jest-failures');
    mkdirSync(dir, { recursive: true });
    const kept = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    copyFileSync(LAST, kept);
    console.log(`jest-checked: kept the full JSON of this run at ${kept}`);
  }
  process.exit(s.ok && !run.status ? 0 : run.status || 1);
}

function safeTotal(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')).numTotalTests ?? null; } catch { return null; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

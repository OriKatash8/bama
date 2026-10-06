/**
 * Pure logic for the "functions in production vs the repo" half of check-deploy-drift.mjs.
 * No network, no gcloud: everything here takes plain data, so it is unit-tested.
 *
 * THE GAP THIS CLOSES. The check used to confirm only that every exported function NAME was
 * deployed. It could not see WHEN a function was deployed or WHICH source was running, so on
 * 2026-09-30 a deploy that created seven functions held back on purpose (the invite functions
 * and callClaude) went unrecorded and unnoticed for a week.
 *
 * TWO IDEAS.
 *  1. A deployed function's uploaded source is reduced to a git TREE hash of its `src/`
 *     folder. That is the same hash `git rev-parse <commit>:functions/src` prints, so a deploy
 *     can be matched to an exact commit (or to "no commit": it was deployed from an
 *     uncommitted tree).
 *  2. docs/deploy-ledger.json records, per function, the (updateTime, source hash) a human
 *     last accepted. Any function whose live (updateTime, source hash) differs from its ledger
 *     entry, or that has no entry, is a deploy nobody recorded: DRIFT.
 */
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const sha1 = (buf) => createHash('sha1').update(buf).digest();

/** git's blob hash for file contents. */
export const gitBlobSha = (content) => {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
};

/**
 * git's tree hash for a set of files, so it equals `git rev-parse <commit>:<dir>`.
 * `files` maps a relative path ('communities/invites.ts') to { content: Buffer, executable?: boolean }.
 * Empty directories do not exist in git and are not representable here.
 */
export function gitTreeSha(files) {
  const root = { files: new Map(), dirs: new Map() };
  for (const [path, file] of files) {
    const parts = path.split('/').filter(Boolean);
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part)) node.dirs.set(part, { files: new Map(), dirs: new Map() });
      node = node.dirs.get(part);
    }
    node.files.set(parts[parts.length - 1], file);
  }
  const build = (node) => {
    const entries = [];
    for (const [name, file] of node.files) {
      entries.push({ sortKey: name, name, mode: file.executable ? '100755' : '100644', sha: Buffer.from(gitBlobSha(file.content), 'hex') });
    }
    for (const [name, child] of node.dirs) {
      entries.push({ sortKey: `${name}/`, name, mode: '40000', sha: build(child) });
    }
    // git orders entries bytewise, comparing a directory as if its name ended in '/'.
    entries.sort((a, b) => Buffer.compare(Buffer.from(a.sortKey), Buffer.from(b.sortKey)));
    const body = Buffer.concat(entries.map((e) => Buffer.concat([Buffer.from(`${e.mode} ${e.name}\0`), e.sha])));
    return sha1(Buffer.concat([Buffer.from(`tree ${body.length}\0`), body]));
  };
  return build(root).toString('hex');
}

/** Reads a directory into the shape gitTreeSha wants. Symlinks are skipped (a source tree has none). */
export function readTree(dir, base = dir, out = new Map()) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) readTree(p, base, out);
    else out.set(p.slice(base.length + 1).split('\\').join('/'), { content: readFileSync(p), executable: (st.mode & 0o111) !== 0 });
  }
  return out;
}

export const treeShaOfDir = (dir) => gitTreeSha(readTree(dir));

/**
 * What the ledger says versus what is live.
 *   deployed: [{ name, region, generation, updateTime, treeSha }]   (treeSha null = could not be read)
 *   ledger:   { [name]: { updateTime, treeSha, ... } }
 * Returns problems (each is DRIFT) and the names that are fully recorded.
 */
export function evaluateLedger({ deployed, ledger }) {
  const problems = [];
  const recorded = [];
  const seen = new Set();
  for (const fn of deployed) {
    seen.add(fn.name);
    const entry = ledger[fn.name];
    if (!entry) {
      problems.push({ kind: 'unrecorded-new', name: fn.name, message: `${fn.name}: live since ${fn.updateTime} and in no recorded deploy` });
      continue;
    }
    if (entry.updateTime !== fn.updateTime) {
      problems.push({ kind: 'unrecorded-update', name: fn.name, message: `${fn.name}: updated ${fn.updateTime}, but the last recorded deploy is ${entry.updateTime}` });
      continue;
    }
    if (fn.treeSha === null) {
      problems.push({ kind: 'source-unreadable', name: fn.name, message: `${fn.name}: its deployed source could not be read, so it cannot be verified` });
      continue;
    }
    if (entry.treeSha !== fn.treeSha) {
      problems.push({ kind: 'source-differs', name: fn.name, message: `${fn.name}: same updateTime as recorded but different source (${short(fn.treeSha)} vs ledger ${short(entry.treeSha)})` });
      continue;
    }
    recorded.push(fn.name);
  }
  for (const name of Object.keys(ledger)) {
    if (!seen.has(name)) problems.push({ kind: 'recorded-but-gone', name, message: `${name}: in the ledger but not deployed (deleted? record it with --record-functions --only ${name})` });
  }
  return { problems, recorded };
}

const short = (s) => (s ? String(s).slice(0, 10) : 'none');

/**
 * Applies a recording to the ledger. `only` is an explicit list of names; names that are no longer
 * deployed are REMOVED from the ledger (that is how a deletion is recorded). Returns a new ledger.
 */
export function recordFunctions({ ledger, deployed, only, how, note, today }) {
  const next = { ...ledger };
  const byName = new Map(deployed.map((f) => [f.name, f]));
  const changed = [];
  for (const name of only) {
    const fn = byName.get(name);
    if (!fn) {
      if (name in next) { delete next[name]; changed.push({ name, action: 'removed' }); }
      continue;
    }
    if (fn.treeSha === null) throw new Error(`${name}: its deployed source could not be read; refusing to record what cannot be verified`);
    next[name] = {
      region: fn.region,
      generation: fn.generation,
      updateTime: fn.updateTime,
      treeSha: fn.treeSha,
      commit: fn.commit ?? null,
      how,
      recordedOn: today,
      note,
    };
    changed.push({ name, action: name in ledger ? 'updated' : 'added' });
  }
  return { ledger: next, changed };
}

/** Sorted keys, so the file diffs cleanly. */
export const serializeLedger = (ledger, header) =>
  JSON.stringify({ ...header, functions: Object.fromEntries(Object.keys(ledger).sort().map((k) => [k, ledger[k]])) }, null, 2) + '\n';

export const RECORD_HOWS = ['deploy', 'baseline', 'found-unrecorded'];

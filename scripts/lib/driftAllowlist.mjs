/**
 * Functions that are exported but INTENTIONALLY not deployed, for
 * check-deploy-drift.mjs. The list lives in scripts/deploy-drift-allowlist.json.
 *
 * An entry is never a bare name: it needs the function, a reason, and the date it
 * was added. It expires after ALLOWLIST_MAX_AGE_DAYS, so "intentionally not
 * deployed" can't quietly become "forgotten". To keep one past that, deploy it,
 * delete it, or re-justify it with a new addedOn (which shows in git history).
 *
 * Any problem with the list is itself drift: the checker exits non-zero.
 */

export const ALLOWLIST_MAX_AGE_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' -> UTC epoch ms, or null if it's not a real calendar date. */
function parseDay(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return t;
}

export function todayUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * @param {{ entries: unknown, exported: Iterable<string>, deployed: Iterable<string>, today: string }} p
 * @returns {{ allowed: {name:string, reason:string, addedOn:string, ageDays:number}[], allowedNames: Set<string>, problems: {kind:string, message:string}[] }}
 */
export function evaluateAllowlist({ entries, exported, deployed, today }) {
  const problems = [];
  const allowed = [];
  const exportedSet = new Set(exported);
  const deployedSet = new Set(deployed);
  const todayMs = parseDay(today);
  if (todayMs === null) throw new Error(`evaluateAllowlist: bad today ${today}`);

  if (entries === undefined || entries === null) return { allowed, allowedNames: new Set(), problems };
  if (!Array.isArray(entries)) {
    problems.push({ kind: 'malformed', message: 'functionsNotDeployed must be an array of { name, reason, addedOn }' });
    return { allowed, allowedNames: new Set(), problems };
  }

  const seen = new Set();
  for (const [i, e] of entries.entries()) {
    const where = `entry ${i}${e && typeof e === 'object' && typeof e.name === 'string' ? ` (${e.name})` : ''}`;
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      problems.push({ kind: 'malformed', message: `${where}: must be { name, reason, addedOn }, not a bare value` });
      continue;
    }
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    const reason = typeof e.reason === 'string' ? e.reason.trim() : '';
    const addedMs = parseDay(e.addedOn);
    const bad = [];
    if (!name) bad.push('missing name');
    if (!reason) bad.push('missing reason');
    if (addedMs === null) bad.push('addedOn must be a real YYYY-MM-DD date');
    else if (addedMs > todayMs) bad.push(`addedOn ${e.addedOn} is in the future`);
    if (name && seen.has(name)) bad.push(`duplicate entry for ${name}`);
    if (name) seen.add(name);
    if (bad.length) {
      problems.push({ kind: 'malformed', message: `${where}: ${bad.join('; ')}` });
      continue;
    }

    const ageDays = Math.floor((todayMs - addedMs) / DAY_MS);
    if (ageDays > ALLOWLIST_MAX_AGE_DAYS) {
      problems.push({
        kind: 'expired',
        message: `${name}: allowlisted ${ageDays} days ago (limit ${ALLOWLIST_MAX_AGE_DAYS}). Deploy it, delete it, or re-justify with a new addedOn. Reason was: ${reason}`,
      });
      continue;
    }
    if (!exportedSet.has(name)) {
      problems.push({ kind: 'stale-not-exported', message: `${name}: not an exported function (typo, or removed?). Remove the entry.` });
      continue;
    }
    if (deployedSet.has(name)) {
      problems.push({ kind: 'stale-deployed', message: `${name}: is deployed now. Remove the entry so the list stays honest.` });
      continue;
    }
    allowed.push({ name, reason, addedOn: e.addedOn, ageDays });
  }
  return { allowed, allowedNames: new Set(allowed.map((a) => a.name)), problems };
}

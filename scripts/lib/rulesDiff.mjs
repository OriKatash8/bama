import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Compare the ruleset that is LIVE with the file about to replace it.
 * `firebase deploy --only firestore:rules` swaps the ENTIRE ruleset, so the only
 * safe question before running it is "what exactly will change in production?".
 */
export function diffRules(deployed, local) {
  if (deployed === local) return { identical: true, text: '', added: 0, removed: 0 };
  const dir = mkdtempSync(join(tmpdir(), 'rules-diff-'));
  try {
    writeFileSync(join(dir, 'live'), deployed);
    writeFileSync(join(dir, 'local'), local);
    // diff exits 1 when the files differ, which is the expected case here.
    const r = spawnSync('diff', ['-u', '--label', 'LIVE (production)', '--label', 'LOCAL firestore.rules', join(dir, 'live'), join(dir, 'local')], { encoding: 'utf8' });
    const text = r.stdout ?? '';
    const lines = text.split('\n');
    return {
      identical: false,
      text,
      added: lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length,
      removed: lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Only the exact word "yes" deploys. "y", "Yes", "yes please", an empty line, EOF: no. */
export function isYes(answer) {
  return answer === 'yes';
}

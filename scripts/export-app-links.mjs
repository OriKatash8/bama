#!/usr/bin/env node
/**
 * Writes legal-site/static/app-links.json, the ONLY thing the public invite landing page
 * knows about config/appLinks: the two store URLs (each kept only if it is an https link).
 * The page fetches it from its own origin; with no file, or empty URLs, it says the app is
 * not in the stores yet. Seeding the store links (seed-app-links.mjs --ios-url ...) and
 * re-running `npm run legal:deploy` is all it takes for the buttons to appear.
 *
 *   node scripts/export-app-links.mjs --project bama-af0a0 [--optional] [--out path]
 *
 * Reads from the emulator when FIRESTORE_EMULATOR_HOST is set, else production (ADC).
 * --optional: a failure (no credentials, no doc, bad doc) prints a loud warning, DELETES any
 * previous output so a stale file never ships, and exits 0, so the legal pages can still be
 * deployed. Without it a failure exits 1.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { storeLinks, validateAppLinks } from './lib/appLinks.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_OUT = resolve(ROOT, 'legal-site/static/app-links.json');

/** Pure core, so it can be tested without Firestore. `readDoc` returns the stored doc or null. */
export async function exportAppLinks({ readDoc, out, write = writeFileSync, mkdir = mkdirSync }) {
  const doc = await readDoc();
  const problems = validateAppLinks(doc);
  if (problems.length) throw new Error(`config/appLinks is not usable:\n  ${problems.join('\n  ')}`);
  const links = storeLinks(doc);
  mkdir(dirname(out), { recursive: true });
  write(out, JSON.stringify(links) + '\n');
  return links;
}

async function main() {
  const args = process.argv.slice(2);
  const valueOf = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined; };
  const optional = args.includes('--optional');
  const out = valueOf('--out') ? resolve(valueOf('--out')) : DEFAULT_OUT;
  const projectId = valueOf('--project');
  if (!projectId || projectId.startsWith('--')) {
    console.error('ERROR: --project <firebaseProjectId> is required.');
    process.exit(2);
  }
  const target = process.env.FIRESTORE_EMULATOR_HOST ? `EMULATOR ${process.env.FIRESTORE_EMULATOR_HOST}` : `PRODUCTION ${projectId}`;
  try {
    const { initializeApp } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const ref = getFirestore(initializeApp({ projectId })).collection('config').doc('appLinks');
    const links = await exportAppLinks({
      out,
      readDoc: async () => { const s = await ref.get(); return s.exists ? s.data() : null; },
    });
    const n = Object.values(links).filter(Boolean).length;
    console.log(`app-links: read config/appLinks from ${target}; wrote ${out}`);
    console.log(n ? `app-links: store buttons WILL appear (${n} link${n > 1 ? 's' : ''}).` : 'app-links: no store links set, so the landing page says the app is not in the stores yet.');
  } catch (e) {
    rmSync(out, { force: true });
    const msg = `app-links: could not export config/appLinks from ${target}: ${e.message}`;
    if (optional) {
      console.warn(`\n!! ${msg}\n!! Continuing WITHOUT store buttons (any previous app-links.json was removed).\n`);
      process.exit(0);
    }
    console.error(msg);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

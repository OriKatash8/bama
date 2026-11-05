#!/usr/bin/env node
/**
 * Production config for payment-link mode. DRY RUN by default; --apply writes.
 *
 *   node scripts/admin-set-payment-link-config.mjs --prod
 *       --provider none|grow_link   --audience testers|all   --testers uid1,uid2   [--allow-all] [--apply]
 *
 * Examples
 *   # switch on for one tester (dry run, then the same line with --apply)
 *   node scripts/admin-set-payment-link-config.mjs --prod --provider grow_link --audience testers --testers <uid>
 *   # switch off (instant rollback)
 *   node scripts/admin-set-payment-link-config.mjs --prod --provider none --apply
 *
 * Writes ONLY config/pricing.paymentProvider and, in config/paymentsPrivate,
 * paymentTestUids and paymentLinkAudience; every other key is left alone. The private
 * doc is written BEFORE the provider flips, so link mode is never on with a stale
 * audience. --audience all needs --allow-all. fake_link is not accepted: it is a test
 * provider. Deploy the functions first (lifecycleCron especially): an old deployment
 * reads grow_link as 'none' and turns the legacy stub sweep on.
 */
import './lib/requireProd.mjs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseTesters, planLinkConfig } from './lib/paymentLinkConfig.mjs';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const apply = argv.includes('--apply');

let testers;
try { testers = parseTesters(flag('--testers')); } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
const want = { provider: flag('--provider'), audience: flag('--audience'), testers, allowAll: argv.includes('--allow-all') };
if (want.provider === undefined && want.audience === undefined && want.testers === null) {
  console.error('nothing to change: pass --provider, --audience and/or --testers');
  process.exit(2);
}

initializeApp({ projectId: 'bama-af0a0' });
const db = getFirestore();
const pricingSnap = await db.doc('config/pricing').get();
if (!pricingSnap.exists) throw new Error('config/pricing is missing; refusing to create it');
const privSnap = await db.doc('config/paymentsPrivate').get();
const current = { pricing: pricingSnap.data(), priv: privSnap.exists ? privSnap.data() : null };

const plan = planLinkConfig(want, current);
const show = (label, pricing, priv) => console.log(`${label}: paymentProvider=${pricing.paymentProvider ?? '(missing = none)'} | `
  + `audience=${priv?.paymentLinkAudience ?? '(missing = testers)'} | testers=${JSON.stringify(priv?.paymentTestUids ?? [])}`);
show('now  ', current.pricing, current.priv);
console.log(`will be: paymentProvider=${plan.after.paymentProvider} | audience=${plan.after.paymentLinkAudience} | testers=${JSON.stringify(plan.after.paymentTestUids)}`);
if (plan.errors.length) { for (const e of plan.errors) console.error(`REFUSED: ${e}`); process.exit(1); }
if (!plan.pricingWrite && !plan.privWrite) { console.log('already as requested; nothing to write'); process.exit(0); }
console.log('writes:');
if (plan.privWrite) console.log(`  config/paymentsPrivate  merge ${JSON.stringify(plan.privWrite)}`);
if (plan.pricingWrite) console.log(`  config/pricing          merge ${JSON.stringify(plan.pricingWrite)}`);
if (!apply) { console.log('dry run; pass --apply to write'); process.exit(0); }

if (plan.privWrite) await db.doc('config/paymentsPrivate').set(plan.privWrite, { merge: true });
if (plan.pricingWrite) await db.doc('config/pricing').set(plan.pricingWrite, { merge: true });
const [p, v] = await Promise.all([db.doc('config/pricing').get(), db.doc('config/paymentsPrivate').get()]);
show('after', p.data(), v.exists ? v.data() : null);
console.log('(servers cache config for up to 60s)');

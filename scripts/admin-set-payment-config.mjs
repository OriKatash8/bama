#!/usr/bin/env node
/**
 * One-time production config for the payments rollout. Dry run by default; --apply writes.
 *
 *   node scripts/admin-set-payment-config.mjs --prod            # dry run
 *   node scripts/admin-set-payment-config.mjs --prod --apply
 *
 * Sets config/pricing.paymentProvider = 'none' if the field is missing (a missing field already
 * reads as 'none'; this makes it explicit) and creates config/paymentsPrivate
 * { paymentTestUids: [] } if it does not exist (a missing doc already reads as no testers). It
 * NEVER overwrites a value that is already set, and refuses if paymentProvider is anything but
 * 'none'. Deploy firestore.rules first: until the paymentsPrivate exclusion is live, any
 * signed-in user can read config/*.
 */
import './lib/requireProd.mjs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
initializeApp({ projectId: 'bama-af0a0' });
const db = getFirestore();

const pricing = await db.doc('config/pricing').get();
if (!pricing.exists) throw new Error('config/pricing is missing; refusing to create it');
const cur = pricing.get('paymentProvider');
if (cur !== undefined && cur !== 'none') throw new Error(`paymentProvider is already ${JSON.stringify(cur)}; not touching it`);
const priv = await db.doc('config/paymentsPrivate').get();

console.log('paymentProvider:', cur ?? '(missing) -> will set "none"');
console.log('paymentsPrivate:', priv.exists ? `exists ${JSON.stringify(priv.data())}, left alone` : '(missing) -> will create { paymentTestUids: [] }');
if (!apply) { console.log('dry run; pass --apply to write'); process.exit(0); }

if (cur === undefined) await db.doc('config/pricing').set({ paymentProvider: 'none' }, { merge: true });
if (!priv.exists) await db.doc('config/paymentsPrivate').create({ paymentTestUids: [] });

const after = await db.doc('config/pricing').get();
const afterPriv = await db.doc('config/paymentsPrivate').get();
console.log('now: paymentProvider =', after.get('paymentProvider'), '| paymentsPrivate =', JSON.stringify(afterPriv.data()));
console.log('other pricing keys untouched:', Object.keys(after.data()).sort().join(','));

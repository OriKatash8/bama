#!/usr/bin/env node
/**
 * Production probe: adminUserActivity is admin-only, returns the right rows per section, and leaks nothing.
 *
 * Seeds (with the Admin SDK) a small world around two throwaway users, every doc tagged with a unique stamp:
 *   subject (a professional), client (their client), and one project with a fee that was disputed and
 *   resolved, a held review, a report filed against the subject, a moderation action, and a community.
 * Then calls the callable (europe-west1) as:
 *   admin       a throwaway user given the `role: admin` claim (never added to ADMIN_UIDS)
 *   client, pro, stranger   plain throwaway accounts: each must get `permission-denied`
 * Checks every section against what was seeded, that bad input is refused, and that a secret planted on
 * the fee doc never appears in any response. Then DELETES every doc and user it made and VERIFIES they are
 * gone, exiting non-zero if anything is left.
 *
 *   node scripts/probe-admin-user-activity-prod.mjs --prod
 */
import './lib/requireProd.mjs'; // explicit --prod required, no default target
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}
const cfg = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
console.log(`\nproject: ${cfg.projectId}  (LIVE)\n`);

const { initializeApp: ia } = await import('firebase-admin/app');
const { getFirestore: gdb, Timestamp } = await import('firebase-admin/firestore');
const { getAuth: gAdminAuth } = await import('firebase-admin/auth');
const STAMP = `probeactivity${Date.now()}`;
const adminApp = ia({ projectId: cfg.projectId }, STAMP);
const adminDb = gdb(adminApp);
const adminAuth = gAdminAuth(adminApp);

let failures = 0;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  - ${d}` : ''}`); if (!ok) failures++; };

const created = { uids: [], docs: [] };
async function principal(name) {
  const app = initializeApp(cfg, `${STAMP}-${name}`);
  const auth = getAuth(app);
  const cred = await createUserWithEmailAndPassword(auth, `${STAMP}-${name}@probe.invalid`, 'Probe-Password-123!');
  created.uids.push(cred.user.uid);
  return { name, uid: cred.user.uid, auth, fns: getFunctions(app, 'europe-west1') };
}
const call = (who, data) => httpsCallable(who.fns, 'adminUserActivity')(data).then((r) => r.data);
const seed = async (path, data) => { await adminDb.doc(path).set(data); created.docs.push(path); };

let exitCode = 0;
try {
  const subject = await principal('subject');
  const client = await principal('client');
  const stranger = await principal('stranger');
  const admin = await principal('admin');
  await adminAuth.setCustomUserClaims(admin.uid, { role: 'admin' });
  await admin.auth.currentUser.getIdToken(true);
  await adminDb.doc(`users/${subject.uid}`).set({ displayName: 'Probe Subject' }, { merge: true });
  await adminDb.doc(`users/${client.uid}`).set({ displayName: 'Probe Client' }, { merge: true });

  const P = `${STAMP}-proj`;
  const SECRET = `SECRET-${STAMP}`;
  const now = Timestamp.now();
  await seed(`projects/${P}`, { title: 'Probe project', status: 'completed', clientId: client.uid, professionalIds: [subject.uid], chatId: `${STAMP}-chat`, createdAt: now, completedAt: now });
  await seed(`projects/${P}/fees/${subject.uid}`, {
    professionalId: subject.uid, projectId: P, feeStatus: 'owed', baseAmount: 1000, feeDue: 30, feePaid: false, status: 'pending',
    engagementStatus: 'completed', hiredAt: now, disputedAt: now, resolvedAt: now, resolvedOutcome: 'completed', disputeReason: 'probe note',
    preDispute: { feeDue: 30, status: 'pending', baseAmount: 1000 }, providerRef: `ref-${STAMP}`, cardToken: SECRET, phone: '+972500000000',
    paymentLink: { processId: `${STAMP}-proc`, amount: 30, url: `https://example.invalid/${SECRET}`, createdAt: now },
  });
  // A review is created, the onReviewCreate trigger publishes it a few seconds later, and a "didn't happen"
  // contest then HOLDS it with an update. Seed it the same way: create, let the trigger finish, then hold.
  const reviewPath = `reviews/${P}_${subject.uid}`;
  await seed(reviewPath, { projectId: P, professionalId: subject.uid, reviewerId: client.uid, authorId: client.uid, authorName: 'Probe Client', rating: 2, body: 'held text', createdAt: now });
  await seed(`reports/${STAMP}-rep`, { reportedUserId: subject.uid, reporterId: client.uid, reason: 'probe report', status: 'pending', targetType: 'user', createdAt: now });
  await seed(`adminActions/${STAMP}-act`, { action: 'warn', targetUserId: subject.uid, actorName: 'Probe Admin', reason: 'probe warning', createdAt: now });
  await seed(`chats/${STAMP}-comm`, { type: 'community', name: 'Probe Community', ownerId: subject.uid, members: [subject.uid, client.uid], status: 'active', createdAt: now });

  await new Promise((r) => setTimeout(r, 20_000)); // onReviewCreate has run by now
  await adminDb.doc(reviewPath).update({ published: false, heldForDispute: true }); // the hold, as contestEngagement does it

  console.log('1. The admin gets each section, matching what was seeded:');
  const sections = {};
  for (const s of ['moderation', 'projects', 'fees', 'disputes', 'reviews', 'communities']) {
    try { sections[s] = await call(admin, { uid: subject.uid, section: s }); }
    catch (e) { check(`admin: ${s}`, false, `${e.code}: ${e.message}`); }
  }
  const sum = await call(admin, { uid: subject.uid, section: 'summary' }).then((r) => r.summary).catch((e) => { check('admin: summary', false, `${e.code}: ${e.message}`); return null; });
  if (sum) {
    check('summary counts: moderation', sum.moderation.actions === 1 && sum.moderation.reportsReceived === 1 && sum.moderation.reportsFiled === 0, JSON.stringify(sum.moderation));
    check('summary counts: projects / reviews / communities', sum.projects.asProfessional === 1 && sum.reviews.received === 1 && sum.reviews.held === 1 && sum.communities.owned === 1,
      JSON.stringify({ p: sum.projects, r: sum.reviews, c: sum.communities }));
    check('summary counts: fees and disputes', sum.fees.records === 1 && sum.fees.open === 1 && sum.fees.owed === 30 && sum.disputes.resolved === 1, JSON.stringify({ f: sum.fees, d: sum.disputes }));
  }
  const m = sections.moderation;
  check('moderation: the action and the report received, newest first', m?.items.length === 2 && m.items.some((i) => i.kind === 'action' && i.reason === 'probe warning') && m.items.some((i) => i.kind === 'report_received' && i.other?.name === 'Probe Client'), `${m?.items.length} item(s)`);
  const pr = sections.projects?.items[0];
  check('projects: as professional, the client by name, the engagement amount', pr?.projectId === P && pr.roles.includes('professional') && pr.others[0]?.name === 'Probe Client' && pr.engagement?.amount === 1000, JSON.stringify(pr?.others));
  const fee = sections.fees?.items[0];
  check('fees: amounts, the link, the reference, and a first-page summary', fee?.baseAmount === 1000 && fee.feeDue === 30 && fee.providerRef === `ref-${STAMP}` && fee.paymentLink?.processId === `${STAMP}-proc` && sections.fees.summary?.owed === 30, JSON.stringify(sections.fees?.summary));
  const dp = sections.disputes?.items[0];
  check('disputes: resolved as completed, with the HELD review (stars, text, author)', dp?.state === 'resolved' && dp.outcome === 'completed' && dp.heldReview?.rating === 2 && dp.heldReview.text === 'held text' && dp.heldReview.authorName === 'Probe Client', JSON.stringify(dp?.heldReview));
  const rv = sections.reviews?.items[0];
  check('reviews: received, held, from the client by name', rv?.direction === 'received' && rv.held === true && rv.published === false && rv.other?.name === 'Probe Client');
  const cm = sections.communities?.items[0];
  check('communities: owner, active, 2 members', cm?.role === 'owner' && cm.status === 'active' && cm.memberCount === 2 && cm.name === 'Probe Community');

  console.log('\n2. Nothing private leaks:');
  const everything = JSON.stringify([...Object.values(sections), sum]);
  check('the planted card token / secret URL / phone number are in NO response', !everything.includes(SECRET) && !everything.includes('+972500000000'));
  check('no email address anywhere in a response', !/@[a-z0-9-]+\.[a-z]/i.test(everything.replace(/example\.invalid/g, '')));

  console.log('\n3. Input is validated:');
  for (const [label, data] of [['no uid', { section: 'moderation' }], ['a uid with a slash', { uid: 'a/b', section: 'moderation' }], ['an unknown section', { uid: subject.uid, section: 'passwords' }], ['a bad cursor', { uid: subject.uid, section: 'moderation', cursor: 'abc' }]]) {
    try { await call(admin, data); check(`admin: ${label}`, false, 'was ALLOWED'); }
    catch (e) { check(`admin: ${label} is invalid-argument`, String(e.code ?? '').includes('invalid-argument'), e.code); }
  }

  console.log('\n4. Everyone else is refused, for the right reason:');
  for (const who of [client, subject, stranger]) {
    for (const section of ['summary', 'moderation', 'fees']) {
      try { await call(who, { uid: subject.uid, section }); check(`${who.name}: ${section}`, false, 'was ALLOWED'); }
      catch (e) { check(`${who.name}: ${section} is permission-denied`, String(e.code ?? '').includes('permission-denied'), e.code); }
    }
  }
} catch (e) {
  console.error('\nPROBE ERROR:', e);
  exitCode = 1;
} finally {
  console.log('\n5. Cleanup, then VERIFY it is gone:');
  // onReviewCreate (a trigger) writes {published, visibleAt} onto every new review a few seconds after it is
  // created, with a merge-set that RE-CREATES a document deleted in the meantime. Let it finish first, or
  // cleanup deletes the review and the trigger quietly brings back a stub.
  await new Promise((r) => setTimeout(r, 25_000));
  for (const path of [...created.docs].reverse()) await adminDb.doc(path).delete().catch(() => {});
  for (const uid of created.uids) await adminAuth.deleteUser(uid).catch(() => {});
  let leftovers = 0;
  for (const path of created.docs) {
    const gone = !(await adminDb.doc(path).get()).exists;
    console.log(`  ${gone ? 'gone  ' : 'STILL THERE'}  doc  ${path}`);
    if (!gone) leftovers++;
  }
  for (const uid of created.uids) {
    const gone = await adminAuth.getUser(uid).then(() => false, (e) => e.code === 'auth/user-not-found');
    await adminDb.doc(`users/${uid}`).delete().catch(() => {});
    const docGone = !(await adminDb.doc(`users/${uid}`).get()).exists;
    console.log(`  ${gone ? 'gone  ' : 'STILL THERE'}  user ${uid}   users/${uid} doc: ${docGone ? 'gone' : 'STILL THERE'}`);
    if (!gone || !docGone) leftovers++;
  }
  console.log(`\n${failures === 0 && leftovers === 0 && exitCode === 0 ? 'ALL PASS, nothing left behind' : `FAILED: ${failures} check(s), ${leftovers} leftover(s)`}`);
  process.exit(failures === 0 && leftovers === 0 && exitCode === 0 ? 0 : 1);
}

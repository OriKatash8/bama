#!/usr/bin/env node
/**
 * PRODUCTION: delete everything the seed scripts created: every Auth user and
 * every Firestore doc (users, their profile/private subdocs, projects) flagged
 * isSeed:true, plus what hangs off a seed project (offers, fees, its chat).
 *
 *   node scripts/removeSeedUsers.mjs --prod            dry run (default): lists everything
 *   node scripts/removeSeedUsers.mjs --prod --commit   deletes
 *
 * The dry run prints every priceOffer / bundleOffer / chat on a seed project that
 * belongs to a REAL (non-seed) user, so you can see who would be affected first.
 * Notifications already sent to real pros are not retracted.
 *
 * Credentials: Application Default Credentials.
 */
import './lib/requireProd.mjs';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const COMMIT = process.argv.includes('--commit');
initializeApp({ projectId: 'bama-af0a0' });
const auth = getAuth();
const db = getFirestore();

const seedUsers = (await db.collection('users').where('isSeed', '==', true).get()).docs;
const seedUids = new Set(seedUsers.map((d) => d.id));
const seedProjects = (await db.collection('projects').where('isSeed', '==', true).get()).docs;
console.log(`seed users: ${seedUsers.length}, seed projects: ${seedProjects.length}`);

const toDelete = []; // DocumentReferences
const affected = []; // real-user items on seed projects
const nameOf = async (uid) => (await db.doc(`users/${uid}`).get()).data()?.displayName ?? '(unknown)';

for (const p of seedProjects) {
  const pid = p.id;
  const proj = p.data();
  console.log(`\nproject ${pid} "${proj.title}" (client ${proj.clientId}, status ${proj.status})`);

  for (const coll of ['priceOffers', 'bundleOffers']) {
    for (const o of (await db.collection(coll).where('projectId', '==', pid).get()).docs) {
      toDelete.push(o.ref);
      const pro = o.data().professionalId;
      if (pro && !seedUids.has(pro)) affected.push(`${coll}/${o.id}: from REAL professional ${pro} "${await nameOf(pro)}" (status ${o.data().status})`);
    }
  }
  // Fees subcollection and every other subcollection (meetings, missions, ...).
  for (const sub of await p.ref.listCollections()) {
    for (const d of (await sub.get()).docs) toDelete.push(d.ref);
  }
  // The project chat, created at first hire.
  const chatIds = new Set(proj.chatId ? [proj.chatId] : []);
  for (const c of (await db.collection('chats').where('projectId', '==', pid).get()).docs) chatIds.add(c.id);
  for (const cid of chatIds) {
    const chat = await db.doc(`chats/${cid}`).get();
    if (!chat.exists) continue;
    const real = (chat.data().members ?? []).filter((m) => !seedUids.has(m));
    if (real.length) affected.push(`chats/${cid}: has REAL members ${(await Promise.all(real.map(async (m) => `${m} "${await nameOf(m)}"`))).join(', ')}`);
    for (const sub of await chat.ref.listCollections()) for (const d of (await sub.get()).docs) toDelete.push(d.ref);
    toDelete.push(chat.ref);
  }
  // Notifications that point at the project (sent to real pros by onProjectCreate).
  for (const n of (await db.collection('notifications').where('data.projectId', '==', pid).get().catch(() => ({ docs: [] }))).docs) {
    toDelete.push(n.ref);
    affected.push(`notifications/${n.id}: sent to user ${n.data().userId} (would be deleted)`);
  }
  toDelete.push(p.ref);
}

for (const u of seedUsers) {
  for (const sub of await u.ref.listCollections()) for (const d of (await sub.get()).docs) toDelete.push(d.ref);
  toDelete.push(u.ref);
}

console.log('\n── REAL (non-seed) users affected ──');
console.log(affected.length ? affected.join('\n') : 'none');
console.log(`\n${toDelete.length} Firestore docs and ${seedUids.size} Auth users ${COMMIT ? 'being deleted' : 'would be deleted'}:`);
for (const u of seedUsers) console.log(`  auth+users/${u.id} "${u.data().displayName}"`);

if (!COMMIT) { console.log('\n(dry run: nothing deleted; pass --commit)'); process.exit(0); }

for (let i = 0; i < toDelete.length; i += 400) {
  const batch = db.batch();
  toDelete.slice(i, i + 400).forEach((r) => batch.delete(r));
  await batch.commit();
}
for (const uid of seedUids) await auth.deleteUser(uid).catch((e) => { if (e.code !== 'auth/user-not-found') throw e; });
console.log('done.');

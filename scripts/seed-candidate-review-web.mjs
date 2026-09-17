#!/usr/bin/env node
/**
 * PRODUCTION seed for the render-only browser pass of the candidate review card
 * (V1 step d). Throwaway accounts and data; nothing is pressed that calls an
 * undeployed callable.
 *
 *   node scripts/seed-candidate-review-web.mjs                    # seed; writes manifest
 *   node scripts/seed-candidate-review-web.mjs --live             # post-deploy click-through seed
 *   node scripts/seed-candidate-review-web.mjs --item3            # item 3 render pass (carousel, pro card)
 *   node scripts/seed-candidate-review-web.mjs --cleanup <file>   # delete + read-only sweep
 *
 * NO REAL USER IS NOTIFIED. onProjectCreate fans "פרויקט חדש" out for an OPEN
 * project with a VACANT seat; every project here has every seat pre-filled by a
 * placeholder AND a targetProfessionalId — the trigger returns on either. Offer and
 * chat-message triggers only notify members, who are all throwaway accounts.
 *
 * What it builds (stamp crweb<ts>):
 *   P1  client + pro A (Editor) + pro B (Sound), both review:'pending'.
 *       Pending price changes: client → A (waiting on the pro),
 *       B → client (waiting on the client). ~40 messages to scroll.
 *   P2  client + pro C on TWO roles, both pending — the price sheet's role picker.
 *   P3  client + pro A, review:'confirmed', project open — the green chip.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const PROJECT = 'bama-af0a0';
const app = initializeApp({ projectId: PROJECT });
const db = getFirestore(app);
const auth = getAuth(app);

const args = process.argv.slice(2);

// ── cleanup ─────────────────────────────────────────────────────────────────
if (args[0] === '--cleanup') {
  const m = JSON.parse(readFileSync(args[1], 'utf8'));
  const deleted = [];
  const del = async (ref, label) => { if ((await ref.get()).exists) { await ref.delete(); deleted.push(label); } };
  const uids = Object.values(m.uids);
  // Chats created later by a real hire are not in the manifest; read them off
  // the projects before the projects are deleted.
  for (const pid of m.projectIds) {
    const chatId = (await db.doc(`projects/${pid}`).get()).data()?.chatId;
    if (chatId && !m.chatIds.includes(chatId)) m.chatIds.push(chatId);
  }

  for (const chatId of m.chatIds) {
    for (const d of (await db.collection(`chats/${chatId}/messages`).get()).docs) await del(d.ref, `chats/${chatId}/messages/${d.id}`);
    await del(db.doc(`chats/${chatId}`), `chats/${chatId}`);
  }
  for (const pid of m.projectIds) {
    for (const sub of ['paymentRequests', 'fees', 'missions', 'meetings', 'removalRequests']) {
      for (const d of (await db.collection(`projects/${pid}/${sub}`).get()).docs) await del(d.ref, `projects/${pid}/${sub}/${d.id}`);
    }
    await del(db.doc(`projects/${pid}`), `projects/${pid}`);
  }
  for (const uid of uids) {
    for (const col of ['priceOffers', 'bundleOffers']) {
      for (const d of (await db.collection(col).where('professionalId', '==', uid).get()).docs) await del(d.ref, `${col}/${d.id}`);
    }
  }
  async function sweepAccounts() {
    for (const uid of uids) {
      for (const d of (await db.collection('notifications').where('userId', '==', uid).get()).docs) await del(d.ref, `notifications/${d.id}`);
      const userRef = db.doc(`users/${uid}`);
      for (const sub of await userRef.listCollections()) {
        for (const d of (await sub.get()).docs) await del(d.ref, `users/${uid}/${sub.id}/${d.id}`);
      }
      await del(userRef, `users/${uid}`);
      const sys = db.doc(`chats/sys_${uid}`);
      for (const d of (await sys.collection('messages').get()).docs) await del(d.ref, `chats/sys_${uid}/messages/${d.id}`);
      await del(sys, `chats/sys_${uid}`);
    }
  }
  await sweepAccounts();
  for (const uid of uids) {
    try { await auth.deleteUser(uid); deleted.push(`auth user ${uid}`); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }
  }
  await new Promise((r) => setTimeout(r, 5000));
  await sweepAccounts(); // late trigger writes

  // Read-only sweep.
  const left = {};
  const count = (k, n) => { left[k] = (left[k] ?? 0) + n; };
  count('projectsByTitle', (await db.collection('projects').where('title', '>=', `Probe ${m.stamp}`).where('title', '<', `Probe ${m.stamp}~`).get()).size);
  for (const uid of uids) {
    count('projectsByClient', (await db.collection('projects').where('clientId', '==', uid).get()).size);
    count('priceOffers', (await db.collection('priceOffers').where('professionalId', '==', uid).get()).size);
    count('bundleOffers', (await db.collection('bundleOffers').where('professionalId', '==', uid).get()).size);
    count('chatsWithMember', (await db.collection('chats').where('members', 'array-contains', uid).get()).size);
    count('notifications', (await db.collection('notifications').where('userId', '==', uid).get()).size);
    count('feesCollectionGroup', (await db.collectionGroup('fees').where('professionalId', '==', uid).get()).size);
    count('userDocs', (await db.doc(`users/${uid}`).get()).exists ? 1 : 0);
    try { await auth.getUser(uid); count('authUsers', 1); } catch { count('authUsers', 0); }
  }
  for (const pid of m.projectIds) count('projectDocs', (await db.doc(`projects/${pid}`).get()).exists ? 1 : 0);
  for (const cid of m.chatIds) count('chatDocs', (await db.doc(`chats/${cid}`).get()).exists ? 1 : 0);

  console.log(`\nDeleted (${deleted.length}):`);
  const groups = {};
  for (const d of deleted) { const k = d.replace(/\/[^/]+$/, '/*').replace(/^auth user .*/, 'auth user'); groups[k] = (groups[k] ?? 0) + 1; }
  for (const [k, n] of Object.entries(groups)) console.log(`  ${String(n).padStart(3)}  ${k}`);
  console.log('\nRead-only sweep:', JSON.stringify(left));
  const total = Object.values(left).reduce((a, b) => a + b, 0);
  console.log(total === 0 ? 'ZERO RESIDUE' : `RESIDUE: ${total}`);
  writeFileSync(args[1].replace(/\.json$/, '.deleted.txt'), deleted.join('\n') + '\n');
  process.exit(total === 0 ? 0 : 1);
}

// ── seed ────────────────────────────────────────────────────────────────────
const LIVE = args[0] === '--live';
const ITEM3 = args[0] === '--item3';
const STAMP = `${LIVE ? 'crlive' : ITEM3 ? 'cri3' : 'crweb'}${Date.now()}`;
const PW = 'Probe-Password-123!';
const who = ITEM3
  ? { client: 'לקוחה בדיקה', proA: 'אבי עורך', proB: 'בני סאונד', proC: 'חן תאורה', proD: 'דנה צלמת' }
  : LIVE
  ? { client: 'לקוחה בדיקה', proA: 'אבי עורך', proB: 'בני סאונד' }
  : { client: 'לקוחה בדיקה', proA: 'אבי עורך', proB: 'בני סאונד', proC: 'חן צלמת' };
const uids = {};
for (const [tag, displayName] of Object.entries(who)) {
  const u = await auth.createUser({ email: `${STAMP}.${tag}@probe.invalid`, password: PW, displayName });
  uids[tag] = u.uid;
}
// onUserCreate writes users/{uid}; wait for it, then set what the app needs to
// let these accounts past onboarding.
await new Promise((r) => setTimeout(r, 6000));
for (const [tag, uid] of Object.entries(uids)) {
  await db.doc(`users/${uid}`).set({
    id: uid, displayName: who[tag], email: `${STAMP}.${tag}@probe.invalid`, photoURL: null,
    clientOnboarded: true, createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  if (tag !== 'client') await db.doc(`users/${uid}/profile/data`).set({ proProfileCompleted: true });
}

const projectIds = [], chatIds = [];
const now = Date.now();

if (ITEM3) {
  const seed = async (key, pros, seats, offers, extra = {}) => {
    const pid = `${STAMP}-${key}`;
    const chatRef = db.collection('chats').doc();
    await db.doc(`projects/${pid}`).set({
      clientId: uids.client, title: `Probe ${STAMP} ${key}`, description: 'item 3 render check', location: 'TLV',
      deadline: 'flexible', status: 'open', createdAt: Timestamp.now(), targetProfessionalId: uids[pros[0]],
      crewSlots: seats.map((category) => ({ category, quantity: 1 })),
      filledSlots: seats.map((category) => ({ category, professionalId: `${STAMP}-filler` })),
      professionalIds: pros.map((p) => uids[p]), chatId: chatRef.id, ...extra,
    });
    await chatRef.set({
      type: 'group', name: `Probe ${key}`, projectId: pid, members: [uids.client, ...pros.map((p) => uids[p])],
      roles: { [uids.client]: 'admin' }, lastMessage: null, createdAt: Timestamp.now(),
    });
    for (const [tag, category, price, fields] of offers) {
      await db.doc(`priceOffers/${pid}-${tag}`).set({
        projectId: pid, professionalId: uids[tag], category, price, status: 'accepted', createdAt: Timestamp.now(), ...fields,
      });
    }
    projectIds.push(pid); chatIds.push(chatRef.id);
    return { pid, chatId: chatRef.id };
  };
  const req = async (pid, id, from, to, pro, category, cur, prop, status, t) => db.collection(`projects/${pid}/paymentRequests`).doc(id).set({
    projectId: pid, fromUserId: uids[from], toUserId: uids[to], professionalId: uids[pro], category,
    currentAmount: cur, proposedAmount: prop, status, createdAt: Timestamp.fromMillis(now - t),
  });

  // P1 — three pending: the carousel.
  const p1 = await seed('p1', ['proA', 'proB', 'proC'], ['Editor', 'Sound Recordist', 'Lighting Tech'], [
    ['proA', 'Editor', 1800, { review: 'pending' }],
    ['proB', 'Sound Recordist', 950, { review: 'pending', proAccepted: true, proAcceptedAt: Timestamp.now() }],
    ['proC', 'Lighting Tech', 700, { review: 'pending' }],
  ]);
  await req(p1.pid, 'client-to-a', 'client', 'proA', 'proA', 'Editor', 1800, 1600, 'pending', 120_000);
  await req(p1.pid, 'c-unprompted', 'proC', 'client', 'proC', 'Lighting Tech', 700, 850, 'pending', 60_000);
  const lines = ['היי לכולם, תודה שהצטרפתם', 'שלום!', 'מתי מתחילים?', 'ביום ראשון', 'מעולה'];
  const senders = [uids.client, uids.proA, uids.proB, uids.proC];
  for (let i = 0; i < 24; i++) {
    await db.collection(`chats/${p1.chatId}/messages`).add({
      senderId: senders[i % 4], text: `${lines[i % lines.length]} (${i + 1})`, timestamp: Timestamp.fromMillis(now - (40 - i) * 60_000), readBy: [],
    });
  }
  // System pills, rendered from the real texts the functions write.
  for (const [text, dt] of [['יוסי צלם עזב את הפרויקט', 14], ['רון עורך החליט/ה לא להמשיך בפרויקט', 13], ['🎬 הצוות נסגר: אבי עורך, בני סאונד', 12]]) {
    await db.collection(`chats/${p1.chatId}/messages`).add({
      senderId: 'system', system: true, text, timestamp: Timestamp.fromMillis(now - dt * 60_000), readBy: [],
    });
  }

  // P2 — a sole pending professional (D): single client card, and D's full action card.
  const p2 = await seed('p2', ['proD'], ['Still Photographer'], [['proD', 'Still Photographer', 1200, { review: 'pending' }]]);

  // P3 — D confirmed by the client: green chip.
  const p3 = await seed('p3', ['proD'], ['Editor'], [['proD', 'Editor', 2200, { review: 'confirmed', proAccepted: true }]]);

  const manifest = { stamp: STAMP, password: PW, uids, projectIds, chatIds, chats: { p1: p1.chatId, p2: p2.chatId, p3: p3.chatId } };
  const out = `/private/tmp/claude-501/-Users-ori-Documents-bama/d3a12253-e9ed-4762-9799-672cc3d762b3/scratchpad/${STAMP}.json`;
  writeFileSync(out, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ ...manifest, emails: Object.fromEntries(Object.keys(who).map((t) => [t, `${STAMP}.${t}@probe.invalid`])) }, null, 2));
  console.log(`\nmanifest: ${out}`);
  process.exit(0);
}

if (LIVE) {
  // Post-deploy click-through: NO chat, NO accepted offer — the real app does the
  // hiring. Each project has one seat, pre-filled by a placeholder, and a
  // targetProfessionalId (onProjectCreate notifies nobody); a PENDING offer from
  // the pro for the client to accept in the Offers tab.
  //   L1 → pro A: invite → counter → pro accepts → רלוונטי → in_progress + 🎬
  //   L2 → pro B: invite → לא רלוונטי (with reason) → removed, DM, stays open
  for (const [key, tag, price] of [['l1', 'proA', 1500], ['l2', 'proB', 900]]) {
    const pid = `${STAMP}-${key}`;
    await db.doc(`projects/${pid}`).set({
      clientId: uids.client, title: `Probe ${STAMP} ${key}`, description: 'live click-through', location: 'TLV',
      deadline: 'flexible', status: 'open', createdAt: Timestamp.now(),
      targetProfessionalId: uids[tag],
      crewSlots: [{ category: 'Editor', quantity: 1 }],
      filledSlots: [{ category: 'Editor', professionalId: `${STAMP}-filler` }],
    });
    await db.doc(`priceOffers/${pid}-${tag}`).set({
      projectId: pid, professionalId: uids[tag], category: 'Editor', price, status: 'pending', createdAt: Timestamp.now(),
    });
    projectIds.push(pid);
  }
  const manifest = { stamp: STAMP, password: PW, uids, projectIds, chatIds: [] };
  const out = `/private/tmp/claude-501/-Users-ori-Documents-bama/d3a12253-e9ed-4762-9799-672cc3d762b3/scratchpad/${STAMP}.json`;
  writeFileSync(out, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ ...manifest, emails: Object.fromEntries(Object.keys(who).map((t) => [t, `${STAMP}.${t}@probe.invalid`])) }, null, 2));
  console.log(`\nmanifest: ${out}`);
  process.exit(0);
}
async function project(key, pros, seats) {
  const pid = `${STAMP}-${key}`;
  const chatRef = db.collection('chats').doc();
  await db.doc(`projects/${pid}`).set({
    clientId: uids.client, title: `Probe ${STAMP} ${key}`, description: 'automated render check', location: 'TLV',
    deadline: 'flexible', status: 'open', createdAt: Timestamp.now(),
    targetProfessionalId: uids[pros[0]],
    crewSlots: seats.map((category) => ({ category, quantity: 1 })),
    // Every seat pre-filled: onProjectCreate sees no vacancy and notifies nobody.
    filledSlots: seats.map((category) => ({ category, professionalId: `${STAMP}-filler` })),
    professionalIds: pros.map((p) => uids[p]),
    chatId: chatRef.id,
  });
  await chatRef.set({
    type: 'group', name: `Probe ${key}`, projectId: pid,
    members: [uids.client, ...pros.map((p) => uids[p])], roles: { [uids.client]: 'admin' },
    lastMessage: null, createdAt: Timestamp.now(),
  });
  projectIds.push(pid);
  chatIds.push(chatRef.id);
  return { pid, chatId: chatRef.id };
}
async function acceptedOffer(pid, tag, category, price, review) {
  await db.doc(`priceOffers/${pid}-${tag}-${category.replace(/\W/g, '')}`).set({
    projectId: pid, professionalId: uids[tag], category, price, status: 'accepted', review, createdAt: Timestamp.now(),
  });
}

const p1 = await project('p1', ['proA', 'proB'], ['Editor', 'Sound Recordist']);
await acceptedOffer(p1.pid, 'proA', 'Editor', 1800, 'pending');
await acceptedOffer(p1.pid, 'proB', 'Sound Recordist', 950, 'pending');
await db.collection(`projects/${p1.pid}/paymentRequests`).doc('client-to-a').set({
  projectId: p1.pid, fromUserId: uids.client, toUserId: uids.proA, professionalId: uids.proA, category: 'Editor',
  currentAmount: 1800, proposedAmount: 1600, status: 'pending', createdAt: Timestamp.fromMillis(now - 60_000),
});
await db.collection(`projects/${p1.pid}/paymentRequests`).doc('b-to-client').set({
  projectId: p1.pid, fromUserId: uids.proB, toUserId: uids.client, professionalId: uids.proB, category: 'Sound Recordist',
  currentAmount: 950, proposedAmount: 1100, status: 'pending', createdAt: Timestamp.fromMillis(now - 30_000),
});
const lines = [
  'היי לשניכם, תודה שהצטרפתם', 'שלום! שמח להיות כאן', 'היי 👋', 'מתי הצילומים מתחילים?', 'ביום ראשון בבוקר',
  'מעולה, אני פנוי', 'יש לכם דוגמאות מפרויקטים קודמים?', 'שולח עכשיו', 'גם אני', 'תודה!',
];
const senders = [uids.client, uids.proA, uids.proB];
for (let i = 0; i < 40; i++) {
  await db.collection(`chats/${p1.chatId}/messages`).add({
    senderId: senders[i % 3], text: `${lines[i % lines.length]} (${i + 1})`,
    timestamp: Timestamp.fromMillis(now - (45 - i) * 60_000), readBy: [],
  });
}

const p2 = await project('p2', ['proC'], ['Editor', 'Still Photographer']);
await acceptedOffer(p2.pid, 'proC', 'Editor', 1200, 'pending');
await acceptedOffer(p2.pid, 'proC', 'Still Photographer', 1500, 'pending');

const p3 = await project('p3', ['proA'], ['Editor']);
await acceptedOffer(p3.pid, 'proA', 'Editor', 2200, 'confirmed');

const manifest = { stamp: STAMP, password: PW, uids, projectIds, chatIds, chats: { p1: p1.chatId, p2: p2.chatId, p3: p3.chatId } };
const out = `/private/tmp/claude-501/-Users-ori-Documents-bama/d3a12253-e9ed-4762-9799-672cc3d762b3/scratchpad/${STAMP}.json`;
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ ...manifest, emails: Object.fromEntries(Object.keys(who).map((t) => [t, `${STAMP}.${t}@probe.invalid`])) }, null, 2));
console.log(`\nmanifest: ${out}`);
process.exit(0);

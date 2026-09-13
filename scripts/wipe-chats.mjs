#!/usr/bin/env node
/**
 * Empty the test CONVERSATIONS out of `chats`, keeping the communities.
 *
 * DRY RUN BY DEFAULT. `--commit` deletes. `--project <id>` required, never guessed.
 *
 *   node scripts/wipe-chats.mjs --project bama-af0a0
 *   node scripts/wipe-chats.mjs --project bama-af0a0 --commit
 *
 * COMMUNITIES ARE CHATS. There is no separate document for them: a community IS a
 * `chats/{id}` with `type: 'community'`, carrying the name, description, category,
 * ownerId, photoURL and members. Deleting by collection would delete the
 * communities along with the noise, so the treatment is per type:
 *
 *   purchase | dm | group   the whole document, recursively — conversation only
 *   community              KEEP the document and its channels; empty the talk
 *
 * A channel is structure, not conversation — `כללי`, and a `market` channel with
 * `kind: 'market'`. Those are rooms someone set up, so they stay; what goes is
 * `channels/{id}/messages`.
 *
 * `joinRequests` go. They are pending requests from test accounts, and they are
 * not the community definition — actual membership lives in `members` on the chat
 * document, which is untouched.
 *
 * STALE PREVIEWS ARE CLEARED. `lastMessage` and `unreadCount` on a community and
 * on each of its channels describe messages this script is deleting. Leaving them
 * would render a chat list preview of a message that no longer exists — the same
 * class of bug as a filter standing in for state, one layer out.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const projectId = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !projectId || projectId.startsWith('--')) {
  console.error('ERROR: --project <firebaseProjectId> is required. Refusing to guess.');
  process.exit(1);
}

initializeApp({ projectId });
const db = getFirestore();
const n = (x) => x.toLocaleString('en-US');
const log = (...a) => console.log(...a);

/** Whole-document deletion applies to everything that is not a community. */
const DELETE_WHOLE = new Set(['purchase', 'dm', 'group']);

const chats = await db.collection('chats').get();

const doomed = [];        // chats to remove entirely
const communities = [];   // chats to keep, with their talk emptied
let untyped = 0;

for (const c of chats.docs) {
  const type = c.data().type;
  if (type === 'community') { communities.push(c); continue; }
  if (DELETE_WHOLE.has(type)) { doomed.push(c); continue; }
  // Neither — a shape this script does not recognise. Counted and LEFT ALONE
  // rather than swept by default: an unknown type is the one case where guessing
  // could take out something that matters.
  untyped += 1;
  log(`  ! chat ${c.id} has type=${JSON.stringify(type)} — not recognised, left alone`);
}

/** Messages and channel messages under one chat. */
async function talkUnder(ref) {
  let messages = 0;
  let channelMessages = 0;
  const channels = [];
  const joinRequests = [];
  const bodies = [];
  for (const sub of await ref.listCollections()) {
    const snap = await sub.get();
    if (sub.id === 'messages') {
      messages += snap.size;
      bodies.push(...snap.docs.map((d) => ({ path: d.ref.path, ...d.data() })));
    } else if (sub.id === 'joinRequests') {
      joinRequests.push(...snap.docs);
    } else if (sub.id === 'channels') {
      for (const ch of snap.docs) {
        channels.push(ch);
        for (const cc of await ch.ref.listCollections()) {
          const m = await cc.get();
          channelMessages += m.size;
          bodies.push(...m.docs.map((d) => ({ path: d.ref.path, ...d.data() })));
        }
      }
    }
  }
  return { messages, channelMessages, channels, joinRequests, bodies };
}

const doomedTally = { byType: new Map(), messages: 0, bodies: [] };
for (const c of doomed) {
  const t = c.data().type;
  doomedTally.byType.set(t, (doomedTally.byType.get(t) ?? 0) + 1);
  const talk = await talkUnder(c.ref);
  doomedTally.messages += talk.messages + talk.channelMessages;
  doomedTally.bodies.push(...talk.bodies);
}

const commTally = { channels: 0, channelMessages: 0, joinRequests: 0, staleLastMessage: 0, bodies: [] };
const commWork = [];
for (const c of communities) {
  const talk = await talkUnder(c.ref);
  commTally.channels += talk.channels.length;
  commTally.channelMessages += talk.channelMessages;
  commTally.joinRequests += talk.joinRequests.length;
  commTally.bodies.push(...talk.bodies);
  if (c.data().lastMessage) commTally.staleLastMessage += 1;
  for (const ch of talk.channels) if (ch.data().lastMessage) commTally.staleLastMessage += 1;
  commWork.push({ chat: c, ...talk });
}

const allBodies = [...doomedTally.bodies, ...commTally.bodies];
let exportFile = '(nothing to export)';
if (allBodies.length > 0) {
  const dir = join(homedir(), 'bama-backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  exportFile = join(dir, `chat-messages-${projectId}-${stamp}.json`);
  writeFileSync(exportFile, JSON.stringify(allBodies, null, 2) + '\n', 'utf8');
}

log('');
log(`  database            ${projectId}`);
log(`  mode                ${commit ? '*** COMMIT — WILL DELETE ***' : 'DRY RUN (nothing written)'}`);
log(`  messages exported   ${exportFile}`);
log('');
log(`  chats in collection ${n(chats.size)}`);
log('');
log('  DELETED ENTIRELY (conversation only — no definition in these)');
for (const [t, c] of [...doomedTally.byType.entries()].sort((a, b) => b[1] - a[1])) {
  log(`    type "${t}"${''.padEnd(Math.max(0, 12 - t.length))}${n(c)} chats`);
}
log(`    their messages    ${n(doomedTally.messages)}`);
log('');
log('  KEPT, WITH THE TALK EMPTIED');
log(`    communities       ${n(communities.length)}  (document, name, members, category all kept)`);
log(`    channels KEPT     ${n(commTally.channels)}  (rooms someone set up — structure, not talk)`);
log(`    channel messages  ${n(commTally.channelMessages)}  deleted`);
log(`    joinRequests      ${n(commTally.joinRequests)}  deleted (pending test requests; members[] untouched)`);
log(`    stale previews    ${n(commTally.staleLastMessage)}  lastMessage/unreadCount to clear`);
log('');
log('  NOT TOUCHED');
log(`    unrecognised type ${n(untyped)}`);
log(`    communities/      ${n((await db.collection('communities').get()).size)}  separate collection, a community definition — kept`);
log('');

if (!commit) {
  log('  Dry run. Nothing was deleted. Re-run with --commit to delete.');
  process.exit(0);
}

log('  Deleting.');
for (const c of doomed) await db.recursiveDelete(c.ref);
log(`    chats removed entirely: ${n(doomed.length)}`);

let msgs = 0, reqs = 0;
for (const { chat, channels, joinRequests } of commWork) {
  for (const ch of channels) {
    for (const cc of await ch.ref.listCollections()) {
      const snap = await cc.get();
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      msgs += snap.size;
    }
    // The channel survives; its preview must not outlive its messages.
    await ch.ref.update({ lastMessage: FieldValue.delete() });
  }
  for (let i = 0; i < joinRequests.length; i += 400) {
    const batch = db.batch();
    joinRequests.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  reqs += joinRequests.length;
  await chat.ref.update({
    lastMessage: FieldValue.delete(),
    unreadCount: FieldValue.delete(),
  });
}
log(`    community channel messages: ${n(msgs)}`);
log(`    joinRequests: ${n(reqs)}`);
log(`    communities kept: ${n(communities.length)}`);
log('');
log('  Done. Re-run the dry run to verify.');

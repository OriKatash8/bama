// node --test scripts/__tests__/*.test.mjs
//
// The pre-launch wipe's keep rules, on fixtures. A rule that keeps too little
// deletes the admin or the demo accounts; one that keeps too much leaves a
// deleted person's data behind. Both directions are pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_UID, DEMO_UIDS, KEEP_UIDS, keepDoc, keepProject, keepChat, keepSubDoc,
  keepFile, refsOfKept, storagePathOfUrl, PLANNED_COLLECTIONS, keepMissingParent,
} from '../lib/wipeClassifier.mjs';

const [D1, D2, D3] = DEMO_UIDS;
const REAL = 'realUserUid123';
const ctx = {
  keptProjects: new Set(['pDemo']), keptChats: new Set(['cDemo', 'q8RfULH56tv5QFofrnsY']),
  keptListings: new Set(['lDemo']), keptMedia: new Set(['course-images/1.jpg']), keptInviteTokens: new Set(),
};

test('keep list is exactly admin, the three demo accounts and bama-system', () => {
  assert.deepEqual(KEEP_UIDS, ['C1pd9uv64yOBYfrPaktXet7Pxfr2', 'demo-test1', 'demo-test2', 'demo-test3', 'bama-system']);
});

test('users: only the keep list survives', () => {
  for (const u of KEEP_UIDS) assert.equal(keepDoc('users', u, {}, ctx), true);
  assert.equal(keepDoc('users', REAL, {}, ctx), false);
});

test('projects: demo-owned with demo crew stay; admin test projects and anything with a real user go', () => {
  assert.equal(keepProject({ clientId: D1, professionalIds: [D2, D3], filledSlots: [{ professionalId: D2 }] }), true);
  assert.equal(keepProject({ clientId: ADMIN_UID, professionalIds: [] }), false);         // owner decision
  assert.equal(keepProject({ clientId: D1, professionalIds: [REAL] }), false);
  assert.equal(keepProject({ clientId: D1, targetProfessionalId: REAL }), false);
  assert.equal(keepProject({ clientId: REAL }), false);
});

test('offers follow their project and their pro', () => {
  assert.equal(keepDoc('priceOffers', 'o', { professionalId: D2, projectId: 'pDemo' }, ctx), true);
  assert.equal(keepDoc('priceOffers', 'o', { professionalId: D2, projectId: 'pAdmin' }, ctx), false);
  assert.equal(keepDoc('bundleOffers', 'o', { professionalId: REAL, projectId: 'pDemo' }, ctx), false);
});

test('chats: all-kept members only; emptied, mixed, system-with-deleted and dead-project chats go', () => {
  assert.equal(keepChat('cDemo', { type: 'dm', members: [D1, D2] }, ctx), true);
  assert.equal(keepChat('g', { type: 'group', members: [D1, D3], projectId: 'pDemo' }, ctx), true);
  assert.equal(keepChat('g', { type: 'group', members: [], projectId: 'pDemo' }, ctx), false);
  assert.equal(keepChat('g', { type: 'group', members: [D1, D3], projectId: 'pAdmin' }, ctx), false);
  assert.equal(keepChat(`sys_${REAL}`, { type: 'dm', members: ['bama-system', REAL] }, ctx), false);
  assert.equal(keepChat('c', { type: 'community', members: [D1], ownerId: REAL }, ctx), false);
  assert.equal(keepChat('c', { type: 'dm', members: [ADMIN_UID, REAL] }, ctx), false);
  // owner decision: the old seeded demo community goes; the new demo one stays
  assert.equal(keepChat('demo-community-bama', { type: 'community', members: [D1, D2, D3], ownerId: D1 }, ctx), false);
  assert.equal(keepChat('q8RfULH56tv5QFofrnsY', { type: 'community', members: [D1], ownerId: D1 }, ctx), true);
  // any community a demo account owns, with demo members, stays — no list to maintain
  assert.equal(keepChat('anyNewDemoCommunity', { type: 'community', members: [D2], ownerId: D2 }, ctx), true);
});

test('reviews, listings, push tokens, notifications', () => {
  assert.equal(keepDoc('reviews', 'r', { reviewerId: D1, professionalId: D2, projectId: 'pDemo' }, ctx), true);
  assert.equal(keepDoc('reviews', 'r', { reviewerId: REAL, professionalId: D2 }, ctx), false);
  assert.equal(keepDoc('marketplace_listings', 'l', { posterId: D1 }, ctx), true);
  assert.equal(keepDoc('marketplace_listings', 'l', { posterId: D1, buyerId: REAL }, ctx), false);
  assert.equal(keepDoc('pushTokens', 't', { userId: ADMIN_UID }, ctx), true);
  assert.equal(keepDoc('pushTokens', 't', { userId: REAL }, ctx), false);
  assert.equal(keepDoc('notifications', 'n', { userId: D3 }, ctx), true);
  assert.equal(keepDoc('notifications', 'n', { userId: ADMIN_UID }, ctx), false);    // owner decision
});

test('config is kept whole; decided collections go entirely', () => {
  assert.equal(keepDoc('config', 'pricing', {}, ctx), true);
  assert.equal(keepDoc('config', 'anythingNew', {}, ctx), true);
  for (const c of ['adminActions', 'reports', 'communityRequests', 'communities', 'cancellations', 'cancellationLogHidden']) {
    assert.equal(keepDoc(c, 'x', { reporterId: ADMIN_UID, requesterId: ADMIN_UID, ownerId: ADMIN_UID }, ctx), false, c);
  }
});

test('courses: every course kept, their clicks only by kept users', () => {
  for (const id of ['YBL54RSFJTVKgghSz2uf', 'anyNewCourse']) assert.equal(keepDoc('courses', id, {}, ctx), true);
  assert.equal(keepSubDoc('courses', 'clicks', REAL), false);
  assert.equal(keepSubDoc('courses', 'clicks', D1), true);
  // a kept user's block of a deleted user, a deleted user's join request or stats in a kept chat
  assert.equal(keepSubDoc('users', 'blocks', REAL), false);
  assert.equal(keepSubDoc('chats', 'joinRequests', REAL), false);
  assert.equal(keepSubDoc('chats', 'memberStats', D2), true);
  assert.equal(keepSubDoc('chats', 'messages', 'anyMessageId'), true);
});

test('video jobs follow the uid in their path', () => {
  assert.equal(keepDoc('videoJobs', 'v', { originalPath: `courses/${ADMIN_UID}/1.mp4` }, ctx), true);
  assert.equal(keepDoc('videoJobs', 'v', { originalPath: `chat-videos/${REAL}/1.mp4` }, ctx), false);
});

test('missing parents (subcollections without a doc) are deleted — even under the keep-every-course rule', () => {
  assert.equal(keepMissingParent('users', REAL), false);
  assert.equal(keepMissingParent('courses', 'deletedCourseId'), false);
  assert.equal(keepMissingParent('users', D1), true);
});

test('an unplanned collection or storage prefix aborts', () => {
  assert.throws(() => keepDoc('somethingNew', 'x', {}, ctx), /unplanned collection/);
  assert.throws(() => keepFile('mystery/x.bin', ctx), /unplanned storage prefix/);
  assert.ok(PLANNED_COLLECTIONS.includes('users'));
});

test('storage: kept users, chats, listings and referenced media stay; the rest goes', () => {
  assert.equal(keepFile(`courses/${ADMIN_UID}/v.mp4`, ctx), true);
  assert.equal(keepFile('course-images/1.jpg', ctx), true);
  assert.equal(keepFile('course-images/2.jpg', ctx), false);
  assert.equal(keepFile(`portfolio/${D1}/a`, ctx), true);
  assert.equal(keepFile(`portfolio/${REAL}/a`, ctx), false);
  assert.equal(keepFile(`avatars/${REAL}`, ctx), false);
  assert.equal(keepFile('chat-images/cDemo/1.jpg', ctx), true);
  assert.equal(keepFile('chat-images/cOther/1.jpg', ctx), false);
  assert.equal(keepFile('chat-images/cOther.jpg', ctx), false);
  assert.equal(keepFile('marketplace/lGone/1', ctx), false);
  assert.equal(keepFile('reports/r1/evidence/u/x.jpg', ctx), false);
  assert.equal(keepFile(`demo-backup/${D1}/portfolio/x`, ctx), true);
});

test('orphan refs: a kept chat\'s unread map is checked too', () => {
  assert.deepEqual(refsOfKept('chats', { members: [D1], unreadCount: { [REAL]: 1 } }).sort(), [D1, REAL].sort());
  assert.equal(storagePathOfUrl('https://firebasestorage.googleapis.com/v0/b/x/o/course-images%2F1.jpg?alt=media'), 'course-images/1.jpg');
});

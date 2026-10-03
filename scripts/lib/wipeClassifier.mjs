/**
 * What the pre-launch wipe keeps. Pure: no Firestore, no Storage — so every rule
 * is tested on fixtures (scripts/__tests__/wipeClassifier.test.mjs).
 * Plan and owner decisions: docs/status/2026-10-03-prelaunch-wipe-phase1.md.
 *
 * Rule of thumb: a document is KEPT only if every user it names is on the keep
 * list AND its parent is kept. Everything else in a planned collection goes.
 * A collection or Storage prefix the plan does not know aborts the run.
 */

export const ADMIN_UID = 'C1pd9uv64yOBYfrPaktXet7Pxfr2';
export const DEMO_UIDS = ['demo-test1', 'demo-test2', 'demo-test3'];
export const SYSTEM_UID = 'bama-system';
export const KEEP_UIDS = [ADMIN_UID, ...DEMO_UIDS, SYSTEM_UID];
/** Chats deleted whoever is in them (owner decision 2026-10-03: the old seeded demo community). */
export const DELETE_CHATS = ['demo-community-bama'];

// Courses: every course is kept (owner decision 2026-10-03); only clicks by deleted users go.

const KEEP = new Set(KEEP_UIDS);
const DEMO = new Set(DEMO_UIDS);
const arr = (v) => (Array.isArray(v) ? v : []);
const uids = (...xs) => xs.flat().filter((x) => typeof x === 'string' && x !== '');
const allKept = (list) => list.every((u) => KEEP.has(u));

/** Every top-level collection the plan covers. Anything else aborts. */
export const PLANNED_COLLECTIONS = [
  'adminActions', 'bundleOffers', 'cancellationLogHidden', 'cancellations', 'chats', 'communities',
  'communityRequests', 'config', 'courses', 'marketplace_listings', 'notifications', 'priceOffers',
  'projects', 'pushTokens', 'reports', 'reviews', 'users', 'videoJobs',
  // absent today; handled if they appear
  'feeBlocks', 'subscriptions', 'rateLimits', 'projectApplications', 'courseRequests',
  'communityInvites', 'communityInviteCodes', 'demoBackups', 'bookings',
];

/** The users a project names. */
export function projectRefs(p) {
  return uids(p.clientId, arr(p.professionalIds), p.targetProfessionalId ?? '',
    arr(p.filledSlots).map((s) => s?.professionalId ?? ''), arr(p.slotHolders));
}

/**
 * Pass 1: projects first (offers, chats and reviews follow them).
 * Owner decision: the admin's own test projects go — only demo-owned projects stay.
 */
export function keepProject(p) {
  return DEMO.has(p.clientId) && allKept(projectRefs(p));
}

/**
 * Pass 2: every other top-level doc. `ctx.keptProjects` and `ctx.keptChats`
 * (Set of ids) come from pass 1 and the chats pass.
 */
export function keepDoc(col, id, d, ctx) {
  switch (col) {
    case 'config': return true;
    case 'users': return KEEP.has(id);
    case 'projects': return keepProject(d);
    case 'priceOffers':
    case 'bundleOffers':
    case 'projectApplications':
      return KEEP.has(d.professionalId) && ctx.keptProjects.has(d.projectId);
    case 'chats': return keepChat(id, d, ctx);
    case 'reviews':
      return KEEP.has(d.reviewerId) && KEEP.has(d.professionalId) && (!d.projectId || ctx.keptProjects.has(d.projectId));
    case 'marketplace_listings':
      return KEEP.has(d.posterId) && (!d.buyerId || KEEP.has(d.buyerId));
    // Owner decision: the admin's notifications all point at its deleted test projects.
    case 'notifications': return DEMO.has(d.userId);
    case 'pushTokens': return KEEP.has(d.userId);
    case 'courses': return true;
    case 'videoJobs': return KEEP.has(String(d.originalPath ?? '').split('/')[1]);
    case 'feeBlocks':
    case 'subscriptions':
      return KEEP.has(id);
    case 'demoBackups': return DEMO.has(id);
    case 'courseRequests': return KEEP.has(d.submittedBy);
    case 'communityInvites': return ctx.keptChats.has(d.communityId);
    case 'communityInviteCodes': return ctx.keptInviteTokens?.has(d.token) ?? false;
    // Owner decisions / nothing to keep:
    case 'adminActions': case 'reports': case 'communityRequests': case 'communities':
    case 'cancellations': case 'cancellationLogHidden': case 'rateLimits': case 'bookings':
      return false;
    default:
      throw new Error(`unplanned collection: ${col}`);
  }
}

/** A chat stays only with a non-empty, all-kept membership, and (if a project chat) a kept project. */
export function keepChat(id, d, ctx) {
  if (DELETE_CHATS.includes(id)) return false;
  const members = uids(arr(d.members));
  if (members.length === 0) return false;                 // emptied project chats
  if (!allKept(members)) return false;
  if (d.ownerId && !KEEP.has(d.ownerId)) return false;
  if (d.projectId && !ctx.keptProjects.has(d.projectId)) return false;
  return true;
}

/**
 * A path with subcollections but NO document of its own (a "missing parent":
 * the doc was deleted, its subcollections were not). Nothing to keep there —
 * except under a kept user, whose own doc must then be investigated, not wiped.
 */
export function keepMissingParent(col, id) {
  return col === 'users' && KEEP.has(id);
}

/** Subcollection docs under a KEPT parent that still go (a click by a deleted user). */
export function keepSubDoc(parentCol, subCol, id) {
  if (parentCol === 'courses' && subCol === 'clicks') return KEEP.has(id);
  if (parentCol === 'users' && subCol === 'blocks') return KEEP.has(id);
  if (parentCol === 'chats' && (subCol === 'joinRequests' || subCol === 'memberStats')) return KEEP.has(id);
  return true;
}

/** Every uid a kept doc still names — the orphan check asserts all are on the keep list. */
export function refsOfKept(col, d) {
  switch (col) {
    case 'projects': return projectRefs(d);
    case 'priceOffers': case 'bundleOffers': case 'projectApplications': return uids(d.professionalId);
    case 'chats': return uids(arr(d.members), d.ownerId ?? '', Object.keys(d.unreadCount ?? {}), Object.keys(d.channelUnread ?? {}), arr(d.hiddenFor));
    case 'reviews': return uids(d.reviewerId, d.professionalId, d.authorId ?? '');
    case 'marketplace_listings': return uids(d.posterId, d.buyerId ?? '');
    case 'notifications': case 'pushTokens': return uids(d.userId);
    default: return [];
  }
}

/**
 * Storage: keep only what a kept user, chat, listing, community or course owns.
 * `ctx.keptChats`, `ctx.keptListings`, `ctx.keptMedia` (Set of object paths a kept
 * community or course points at). Unknown top-level prefixes abort.
 */
export function keepFile(name, ctx) {
  const [top, second] = name.split('/');
  switch (top) {
    case 'avatars': return KEEP.has(second);
    case 'portfolio': case 'chat-videos': case 'users': case 'courses':
      return KEEP.has(second);
    case 'demo-backup': return DEMO.has(second);
    case 'chat-images': case 'chat-audio':
      return ctx.keptChats.has(second.replace(/\.jpg$/, ''));
    case 'marketplace': return ctx.keptListings.has(second);
    case 'community-images': case 'course-images':
      return ctx.keptMedia.has(name);
    case 'reports': return false;
    default: throw new Error(`unplanned storage prefix: ${top}/`);
  }
}

/** The object path inside a Firebase download URL, or null. */
export function storagePathOfUrl(url) {
  const m = String(url ?? '').match(/\/o\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

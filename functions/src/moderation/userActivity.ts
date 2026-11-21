import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, requireAdmin } from '../lifecycle/helpers';
import { heldReviewOf, type HeldReview } from '../lifecycle/heldReview';

/**
 * Everything the admin might want to know about one person, in lazy sections for the Users screen:
 * moderation (actions, reports filed and received), projects (as client and as professional), fees and
 * payments, disputes (with any held review), reviews, communities. ADMIN ONLY.
 *
 * WHY A CALLABLE. Fee documents are readable only by their owner under the rules, and a person's story
 * spans several collections; the Admin SDK reads them all in one place, and `requireAdmin` runs before
 * a single read.
 *
 * WHAT IT NEVER RETURNS: chat messages, phone numbers or emails of other people, payment tokens,
 * provider secrets, notification text. Counterparties come back as {uid, name} and nothing more; the
 * person's own email and phone stay in the details sheet that already reads them for admins.
 *
 * COST. No orderBy anywhere: every query is a single-field equality or array-contains (automatic
 * indexes, plus the existing collection-group index on fees.professionalId), capped at FETCH_CAP
 * rows, sorted newest first in memory and paged by an offset cursor. Names and titles are looked up
 * only for the page being returned. `truncated` tells the screen when a cap was hit.
 */

export const PAGE_SIZE = 20;
export const FETCH_CAP = 200;
/** Client-side disputes are read from the newest projects only: one fee-collection read each. */
const CLIENT_PROJECT_CAP = 50;
const CHAT_CAP = 500;
const SNIPPET = 200;
const TEXT = 300;

export const SECTIONS = ['summary', 'moderation', 'projects', 'fees', 'disputes', 'reviews', 'communities'] as const;
export type ActivitySection = (typeof SECTIONS)[number];

export type Person = { uid: string; name: string };

// ── shapes returned to the app ───────────────────────────────────────────────────────────────────

export type ModerationItem =
  | { kind: 'action'; id: string; at: number | null; action: string; reason: string; actorName: string; reportId: string | null }
  | {
    kind: 'report_received' | 'report_filed'; id: string; at: number | null; type: string | null;
    targetType: string | null; reason: string; snippet: string; status: string; other: Person | null;
  };

export type ProjectItem = {
  projectId: string; title: string; status: string; roles: ('client' | 'professional')[]; at: number | null;
  completedAt: number | null; chatId: string | null; others: Person[];
  engagement: { status: string | null; amount: number } | null;
};

export type FeeItem = {
  projectId: string; title: string; at: number | null; engagementStatus: string | null; status: string | null;
  baseAmount: number; feeDue: number; paidAmount: number; feePaid: boolean; paidAt: number | null;
  paidBy: string | null; chargeState: string | null; chargeDueAt: number | null; overdueAt: number | null;
  providerRef: string | null; paymentLink: { processId: string; amount: number; createdAt: number | null; superseded: boolean } | null;
  review: string | null;
};

export type DisputeItem = {
  projectId: string; title: string; at: number | null; role: 'professional' | 'client'; pro: Person;
  state: 'open' | 'resolved'; reason: string | null; note: string; outcome: string | null; resolvedAt: number | null;
  originalFee: number | null; heldReview: HeldReview | null;
};

export type ReviewItem = {
  id: string; at: number | null; direction: 'received' | 'given'; rating: number; text: string;
  published: boolean; held: boolean; projectId: string | null; other: Person | null;
};

export type CommunityItem = {
  id: string; name: string; role: 'owner' | 'member'; status: 'active' | 'suspended'; memberCount: number; at: number | null;
};

export type ActivitySummary = {
  moderation: { actions: number; reportsReceived: number; reportsFiled: number };
  projects: { asClient: number; asProfessional: number };
  fees: { records: number; open: number; owed: number; blockedFrom: number | null };
  disputes: { open: number; resolved: number };
  reviews: { received: number; given: number; held: number };
  communities: { owned: number; member: number };
};

export type SectionPage<T> = {
  section: ActivitySection; items: T[]; nextCursor: string | null; total: number; truncated: boolean;
  /** Fees only, on the first page: where the professional stands. */
  summary?: { owed: number; open: number; paid: number; blockedFrom: number | null };
};

// ── small pure helpers (exported for tests) ──────────────────────────────────────────────────────

type Doc = { id: string; data: () => Record<string, unknown> };

export const millis = (t: unknown): number | null =>
  t && typeof (t as { toMillis?: () => number }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : null;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clip = (v: unknown, n: number): string => str(v).slice(0, n);

/** Parse the offset cursor: absent or empty is the first page; anything but a non-negative integer is refused. */
export function parseCursor(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  if (typeof raw !== 'string' || !/^\d{1,6}$/.test(raw)) throw new HttpsError('invalid-argument', 'bad-cursor');
  return Number(raw);
}

/** Newest first, then one page. Pure. */
export function paginate<T extends { at: number | null }>(
  all: T[], cursor: unknown,
): { items: T[]; nextCursor: string | null; total: number } {
  const start = parseCursor(cursor);
  const sorted = [...all].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const end = start + PAGE_SIZE;
  return { items: sorted.slice(start, end), nextCursor: end < sorted.length ? String(end) : null, total: sorted.length };
}

/** Looks up display names once per call. A missing name stays '' (the screen says "Unknown user"). */
function nameLookup() {
  const cache = new Map<string, Promise<string>>();
  const one = (uid: string) => {
    if (!cache.has(uid)) {
      cache.set(uid, db.doc(`users/${uid}`).get().then((s) => str(s.data()?.displayName)).catch(() => ''));
    }
    return cache.get(uid)!;
  };
  return {
    person: async (uid: string | null | undefined): Promise<Person | null> => (uid ? { uid, name: await one(uid) } : null),
  };
}

const capped = async (q: { limit: (n: number) => { get: () => Promise<{ docs: Doc[] }> } }): Promise<Doc[]> =>
  (await q.limit(FETCH_CAP).get()).docs;

// ── sections ─────────────────────────────────────────────────────────────────────────────────────

async function moderation(uid: string, cursor: unknown): Promise<SectionPage<ModerationItem>> {
  const [actions, received, filed] = await Promise.all([
    capped(db.collection('adminActions').where('targetUserId', '==', uid)),
    capped(db.collection('reports').where('reportedUserId', '==', uid)),
    capped(db.collection('reports').where('reporterId', '==', uid)),
  ]);
  type Raw = { at: number | null; build: () => Promise<ModerationItem> };
  const names = nameLookup();
  const rows: Raw[] = [
    ...actions.map((d): Raw => {
      const a = d.data();
      return {
        at: millis(a.createdAt),
        build: async () => ({
          kind: 'action', id: d.id, at: millis(a.createdAt), action: str(a.action), reason: clip(a.reason, TEXT),
          actorName: str(a.actorName), reportId: str(a.reportId) || null,
        }),
      };
    }),
    ...[...received.map((d) => ({ d, kind: 'report_received' as const })), ...filed.map((d) => ({ d, kind: 'report_filed' as const }))]
      .map(({ d, kind }): Raw => {
        const r = d.data();
        return {
          at: millis(r.createdAt),
          build: async () => ({
            kind, id: d.id, at: millis(r.createdAt), type: str(r.type) || null, targetType: str(r.targetType) || null,
            reason: clip(r.reason, TEXT), snippet: clip(r.snippet, SNIPPET), status: str(r.status),
            other: await names.person(kind === 'report_received' ? str(r.reporterId) : str(r.reportedUserId)),
          }),
        };
      }),
  ];
  const page = paginate(rows, cursor);
  return {
    section: 'moderation', items: await Promise.all(page.items.map((r) => r.build())), nextCursor: page.nextCursor,
    total: page.total, truncated: [actions, received, filed].some((l) => l.length >= FETCH_CAP),
  };
}

async function projects(uid: string, cursor: unknown): Promise<SectionPage<ProjectItem>> {
  const [asClient, asPro] = await Promise.all([
    capped(db.collection('projects').where('clientId', '==', uid)),
    capped(db.collection('projects').where('professionalIds', 'array-contains', uid)),
  ]);
  const byId = new Map<string, { doc: Doc; roles: ('client' | 'professional')[] }>();
  for (const d of asClient) byId.set(d.id, { doc: d, roles: ['client'] });
  for (const d of asPro) {
    const hit = byId.get(d.id);
    if (hit) hit.roles.push('professional'); else byId.set(d.id, { doc: d, roles: ['professional'] });
  }
  const rows = [...byId.values()].map((v) => ({ ...v, at: millis(v.doc.data().createdAt) }));
  const page = paginate(rows, cursor);
  const names = nameLookup();
  const items = await Promise.all(page.items.map(async ({ doc, roles, at }): Promise<ProjectItem> => {
    const p = doc.data();
    const hired = Array.isArray(p.professionalIds) ? (p.professionalIds as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    const others = roles.includes('client')
      ? await Promise.all(hired.filter((id) => id !== uid).slice(0, 5).map((id) => names.person(id)))
      : [await names.person(str(p.clientId))];
    let engagement: ProjectItem['engagement'] = null;
    if (roles.includes('professional')) {
      const fee = (await db.doc(`projects/${doc.id}/fees/${uid}`).get()).data();
      if (fee) engagement = { status: str(fee.engagementStatus) || null, amount: num(fee.baseAmount) };
    }
    return {
      projectId: doc.id, title: str(p.title), status: str(p.status), roles, at, completedAt: millis(p.completedAt),
      chatId: str(p.chatId) || null, others: others.filter((o): o is Person => !!o), engagement,
    };
  }));
  return { section: 'projects', items, nextCursor: page.nextCursor, total: page.total, truncated: asClient.length >= FETCH_CAP || asPro.length >= FETCH_CAP };
}

const feeDocs = (uid: string) => capped(db.collectionGroup('fees').where('professionalId', '==', uid));
const projectIdOf = (d: Doc) => str(d.data().projectId) || ((d as unknown as { ref?: { parent?: { parent?: { id?: string } } } }).ref?.parent?.parent?.id ?? '');
const when = (f: Record<string, unknown>) => millis(f.hiredAt) ?? millis(f.createdAt);

/** The fee's amounts and how it was settled. Pure over the document data. */
export function feeItemOf(projectId: string, title: string, f: Record<string, unknown>): FeeItem {
  const link = f.paymentLink as Record<string, unknown> | undefined;
  const lr = f.linkReview as Record<string, unknown> | undefined;
  const cr = f.chargeReview as Record<string, unknown> | undefined;
  return {
    projectId, title, at: when(f), engagementStatus: str(f.engagementStatus) || null, status: str(f.status) || null,
    baseAmount: num(f.baseAmount), feeDue: num(f.feeDue), paidAmount: num(f.paidAmount), feePaid: f.feePaid === true,
    paidAt: millis(f.feePaidAt), paidBy: str(f.paidBy) || null, chargeState: str(f.chargeState) || null,
    chargeDueAt: millis(f.chargeDueAt), overdueAt: millis(f.overdueAt), providerRef: str(f.providerRef) || null,
    paymentLink: link ? { processId: str(link.processId), amount: num(link.amount), createdAt: millis(link.createdAt), superseded: link.superseded === true } : null,
    review: str(lr?.reason) || str(cr?.reason) || null,
  };
}

async function fees(uid: string, cursor: unknown): Promise<SectionPage<FeeItem>> {
  const docs = await feeDocs(uid);
  const rows = docs.map((d) => ({ d, at: when(d.data()) }));
  const page = paginate(rows, cursor);
  const items = await Promise.all(page.items.map(async ({ d }) => {
    const projectId = projectIdOf(d);
    const title = projectId ? str((await db.doc(`projects/${projectId}`).get()).data()?.title) : '';
    return feeItemOf(projectId, title, d.data());
  }));
  const first = !parseCursor(cursor);
  let summary: SectionPage<FeeItem>['summary'];
  if (first) {
    const open = docs.filter((d) => d.data().feePaid !== true && num(d.data().feeDue) > 0);
    summary = {
      owed: open.reduce((s, d) => s + num(d.data().feeDue), 0), open: open.length,
      paid: docs.filter((d) => d.data().feePaid === true).length,
      blockedFrom: millis((await db.doc(`feeBlocks/${uid}`).get()).data()?.blockedFrom),
    };
  }
  return { section: 'fees', items, nextCursor: page.nextCursor, total: page.total, truncated: docs.length >= FETCH_CAP, ...(summary ? { summary } : {}) };
}

const isDisputeFee = (f: Record<string, unknown>) => !!f.disputedAt || !!f.resolvedAt || f.engagementStatus === 'disputed';

async function disputes(uid: string, cursor: unknown): Promise<SectionPage<DisputeItem>> {
  const names = nameLookup();
  type Row = { projectId: string; proId: string; fee: Record<string, unknown>; role: 'professional' | 'client'; at: number | null };
  const rows: Row[] = [];
  const asPro = (await feeDocs(uid)).filter((d) => isDisputeFee(d.data()));
  for (const d of asPro) {
    const f = d.data();
    rows.push({ projectId: projectIdOf(d), proId: uid, fee: f, role: 'professional', at: millis(f.disputedAt) ?? millis(f.resolvedAt) });
  }
  // As the client: the fee records of their newest projects (one read each), keeping the contested ones.
  const owned = (await capped(db.collection('projects').where('clientId', '==', uid)))
    .sort((a, b) => (millis(b.data().createdAt) ?? 0) - (millis(a.data().createdAt) ?? 0)).slice(0, CLIENT_PROJECT_CAP);
  const perProject = await Promise.all(owned.map(async (p) => ({ p, fees: (await db.collection(`projects/${p.id}/fees`).get()).docs })));
  for (const { p, fees: list } of perProject) {
    for (const fd of list as Doc[]) {
      const f = fd.data();
      if (isDisputeFee(f)) rows.push({ projectId: p.id, proId: fd.id, fee: f, role: 'client', at: millis(f.disputedAt) ?? millis(f.resolvedAt) });
    }
  }
  const page = paginate(rows, cursor);
  const items = await Promise.all(page.items.map(async (r): Promise<DisputeItem> => {
    const f = r.fee;
    const review = await db.collection('reviews').where('projectId', '==', r.projectId).where('professionalId', '==', r.proId).get();
    const title = r.projectId ? str((await db.doc(`projects/${r.projectId}`).get()).data()?.title) : '';
    const pre = f.preDispute as Record<string, unknown> | undefined;
    return {
      projectId: r.projectId, title, at: r.at, role: r.role, pro: (await names.person(r.proId))!,
      state: f.engagementStatus === 'disputed' ? 'open' : 'resolved',
      reason: str((f.adminReview as Record<string, unknown> | undefined)?.reason) || null,
      note: clip(f.disputeReason, TEXT), outcome: str(f.resolvedOutcome) || null, resolvedAt: millis(f.resolvedAt),
      originalFee: pre ? num(pre.feeDue) : null, heldReview: heldReviewOf((review.docs as Doc[])),
    };
  }));
  return { section: 'disputes', items, nextCursor: page.nextCursor, total: page.total, truncated: asPro.length >= FETCH_CAP || owned.length >= CLIENT_PROJECT_CAP };
}

async function reviews(uid: string, cursor: unknown): Promise<SectionPage<ReviewItem>> {
  const [received, given, givenLegacy] = await Promise.all([
    capped(db.collection('reviews').where('professionalId', '==', uid)),
    capped(db.collection('reviews').where('reviewerId', '==', uid)),
    capped(db.collection('reviews').where('authorId', '==', uid)),
  ]);
  const seen = new Set<string>();
  const rows: { d: Doc; direction: 'received' | 'given'; at: number | null }[] = [];
  for (const d of received) { seen.add(d.id); rows.push({ d, direction: 'received', at: millis(d.data().createdAt) }); }
  for (const d of [...given, ...givenLegacy]) {
    if (seen.has(d.id)) continue; // a review of yourself is counted once
    seen.add(d.id);
    rows.push({ d, direction: 'given', at: millis(d.data().createdAt) });
  }
  const page = paginate(rows, cursor);
  const names = nameLookup();
  const items = await Promise.all(page.items.map(async ({ d, direction, at }): Promise<ReviewItem> => {
    const r = d.data();
    const otherId = direction === 'received' ? (str(r.reviewerId) || str(r.authorId)) : str(r.professionalId);
    return {
      id: d.id, at, direction, rating: num(r.rating), text: clip(r.body ?? r.text, TEXT), published: r.published !== false,
      held: r.heldForDispute === true, projectId: str(r.projectId) || null, other: await names.person(otherId),
    };
  }));
  return { section: 'reviews', items, nextCursor: page.nextCursor, total: page.total, truncated: [received, given, givenLegacy].some((l) => l.length >= FETCH_CAP) };
}

async function communities(uid: string, cursor: unknown): Promise<SectionPage<CommunityItem>> {
  // `members array-contains` plus `type ==` would need a composite index; one automatic index and a
  // filter in memory does not.
  const [member, owned] = await Promise.all([
    (await db.collection('chats').where('members', 'array-contains', uid).limit(CHAT_CAP).get()).docs as Doc[],
    (await db.collection('chats').where('ownerId', '==', uid).limit(CHAT_CAP).get()).docs as Doc[],
  ]);
  const byId = new Map<string, Doc>();
  for (const d of [...member, ...owned]) if (d.data().type === 'community') byId.set(d.id, d);
  const rows = [...byId.values()].map((d) => {
    const c = d.data();
    return {
      id: d.id, name: str(c.name), role: c.ownerId === uid ? 'owner' as const : 'member' as const,
      status: c.status === 'suspended' ? 'suspended' as const : 'active' as const,
      memberCount: Array.isArray(c.members) ? c.members.length : 0, at: millis(c.createdAt),
    };
  });
  const page = paginate(rows, cursor);
  return { section: 'communities', items: page.items, nextCursor: page.nextCursor, total: page.total, truncated: member.length >= CHAT_CAP || owned.length >= CHAT_CAP };
}

const count = async (q: { count: () => { get: () => Promise<{ data: () => { count: number } }> } }) => (await q.count().get()).data().count;

async function summary(uid: string): Promise<ActivitySummary> {
  const [actions, reportsReceived, reportsFiled, asClient, asProfessional, received, given, held, feeList, memberChats, ownedChats, blocks] =
    await Promise.all([
      count(db.collection('adminActions').where('targetUserId', '==', uid)),
      count(db.collection('reports').where('reportedUserId', '==', uid)),
      count(db.collection('reports').where('reporterId', '==', uid)),
      count(db.collection('projects').where('clientId', '==', uid)),
      count(db.collection('projects').where('professionalIds', 'array-contains', uid)),
      count(db.collection('reviews').where('professionalId', '==', uid)),
      count(db.collection('reviews').where('reviewerId', '==', uid)),
      count(db.collection('reviews').where('professionalId', '==', uid).where('heldForDispute', '==', true)),
      feeDocs(uid),
      db.collection('chats').where('members', 'array-contains', uid).limit(CHAT_CAP).get(),
      db.collection('chats').where('ownerId', '==', uid).limit(CHAT_CAP).get(),
      db.doc(`feeBlocks/${uid}`).get(),
    ]);
  const open = feeList.filter((d) => d.data().feePaid !== true && num(d.data().feeDue) > 0);
  const disputed = feeList.filter((d) => isDisputeFee(d.data()));
  const mine = new Map<string, Doc>();
  for (const d of [...(memberChats.docs as Doc[]), ...(ownedChats.docs as Doc[])]) if (d.data().type === 'community') mine.set(d.id, d);
  return {
    moderation: { actions, reportsReceived, reportsFiled },
    projects: { asClient, asProfessional },
    fees: { records: feeList.length, open: open.length, owed: open.reduce((s, d) => s + num(d.data().feeDue), 0), blockedFrom: millis(blocks.data()?.blockedFrom) },
    // Counted from the professional's own fee records; the Disputes tab adds the ones raised on their projects as a client.
    disputes: { open: disputed.filter((d) => d.data().engagementStatus === 'disputed').length, resolved: disputed.filter((d) => d.data().engagementStatus !== 'disputed').length },
    reviews: { received, given, held },
    communities: { owned: [...mine.values()].filter((d) => d.data().ownerId === uid).length, member: mine.size },
  };
}

// ── the callable ─────────────────────────────────────────────────────────────────────────────────

export const adminUserActivity = onCall({ region: 'europe-west1' }, async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token); // before a single read
  const uid = request.data?.uid;
  const section = request.data?.section;
  if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/')) throw new HttpsError('invalid-argument', 'uid required');
  if (typeof section !== 'string' || !(SECTIONS as readonly string[]).includes(section)) throw new HttpsError('invalid-argument', 'unknown-section');
  const cursor = request.data?.cursor;
  switch (section as ActivitySection) {
    case 'summary': return { section, summary: await summary(uid) };
    case 'moderation': return moderation(uid, cursor);
    case 'projects': return projects(uid, cursor);
    case 'fees': return fees(uid, cursor);
    case 'disputes': return disputes(uid, cursor);
    case 'reviews': return reviews(uid, cursor);
    case 'communities': return communities(uid, cursor);
  }
});

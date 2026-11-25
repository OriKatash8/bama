import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db, FieldValue, Timestamp, notify, type FeeDoc } from './helpers';
import { readConfig, type PricingConfig } from './config';
import {
  TIMEZONE, effectiveOverdueAt, earliestOverdueAt, feeIsOverdue, DEFAULT_FEE_REMINDER_LEAD_DAYS,
  DEFAULT_REMINDER_HOUR_IL,
} from '../pricing';
import { ADMIN_UIDS } from '../moderation/reportAlert';
import {
  addBusinessDays, feeTimeline, firstNoticeAtOrAfter, formatEndOfDayHe, instantAt,
  previousBusinessDay, ymdOf, type DayRules,
} from './businessDays';

/**
 * The overdue-fee block (config/pricing.feeOverdueBlockDays, behind the
 * feeOverdueBlockEnabled kill switch).
 *
 * A professional with an unpaid fee past `effectiveOverdueAt` may not be hired
 * and may not send new offers. Their existing engagements are never touched.
 *
 * Three enforcement points read one predicate (feeIsOverdue / earliestOverdueAt,
 * pricing.ts):
 *   - hireProfessional queries the pro's fees live — the authoritative gate,
 *     next to the slot cap, and independent of anything stored here;
 *   - the offer/application create rules compare `request.time` against
 *     feeBlocks/{proId}.blockedFrom, which this file maintains. Rules cannot run
 *     a collection-group query, so they need a precomputed time — and storing a
 *     TIME rather than a flag is what lets the block start on the second without
 *     any cron;
 *   - the client mirror (useFeeArrears) only explains.
 *
 * feeBlocks/{proId} is server-only and owner-read-only, NOT a field on users/{uid}:
 * that doc is readable by every signed-in user, and a client must never learn that
 * a professional owes BAMA money (spec §6).
 */

type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

/**
 * When the block will start for a fee just stamped by overdueStampFields, in ms —
 * `undefined` when nothing was stamped (switch off). The same max() as
 * effectiveOverdueAt: never inside the contest window.
 */
export function blockAtOf(stamp: Update, chargeDueAt: { toMillis(): number }): number | undefined {
  const at = (stamp.overdueAt as { toMillis?: () => number } | undefined)?.toMillis?.();
  return typeof at === 'number' ? Math.max(at, chargeDueAt.toMillis()) : undefined;
}

export function feeBlockRef(proId: string) {
  return db.doc(`feeBlocks/${proId}`);
}

/**
 * The `overdueAt` fields to write when an engagement completes (or a dispute is
 * resolved as completed) at `fromMs`. Empty while the switch is off — the reason
 * turning it on can never block anyone for a fee completed while it was off.
 *
 * `overdueAt` IS THE BLOCK TIME, and `chargeDueAt` (stamped next to it by the
 * caller) IS THE END OF THE DISPUTE WINDOW. Both are Israeli-business-day
 * deadlines (businessDays.ts), computed once here and never again:
 *   - at completion: the block is `disputeWindowBusinessDays + blockGraceBusinessDays`
 *     business days after the completion day;
 *   - at a dispute resolution ('resolution'): the window is long closed, so the
 *     clock restarts with just the grace period.
 * A stamp also writes `feeTimingVersion: 2` and a fresh `reminders` map, which is
 * what opts the fee into the v2 notice sequence. (The legacy sweep ignores v2.)
 *
 * `keepEarlier`: a professional re-hired onto a project whose fee is still unpaid
 * keeps the clock that was already running on that debt; completing the second
 * role must not push the first one's deadline back. In that case only
 * `overdueAt` is returned — the debt's own version and reminders stay as they were.
 */
export function overdueStampFields(
  config: Pick<PricingConfig,
    'feeOverdueBlockEnabled' | 'disputeWindowBusinessDays' | 'blockGraceBusinessDays'
    | 'extraNonBusinessDays'>,
  fromMs: number,
  existing?: Pick<FeeDoc, 'overdueAt' | 'feePaid' | 'status'>,
  kind: 'completion' | 'resolution' = 'completion',
): Update {
  if (!config.feeOverdueBlockEnabled) return {};
  const fresh = kind === 'completion'
    ? feeTimeline(config, fromMs).blockAt
    : addBusinessDays(fromMs, config.blockGraceBusinessDays, config);
  const prior = existing?.overdueAt?.toMillis?.();
  const unpaid = existing && existing.feePaid !== true && existing.status !== 'paid'
    && existing.status !== 'not_owed';
  if (unpaid && typeof prior === 'number' && prior < fresh) {
    return { overdueAt: Timestamp.fromMillis(prior) };
  }
  return {
    overdueAt: Timestamp.fromMillis(fresh),
    feeTimingVersion: 2,
    // A resolution is its own "window closed" notice (sent by the resolver), so
    // the window-end stage starts already done.
    reminders: kind === 'resolution' ? { windowEnd: Timestamp.fromMillis(fromMs) } : {},
  };
}

/**
 * Rebuild feeBlocks/{proId}.blockedFrom from the professional's fees.
 *
 * In a transaction — the Admin SDK can read a query inside one — so two concurrent
 * recomputes serialise and the last write is computed from the last state. Called
 * DIRECTLY by every path that can lift or pause a block (settleFee,
 * resolveFeeDispute, contest, cancel, release) and again by the fee-write trigger
 * below as a safety net, so a professional who paid is never left blocked by a
 * late or failed trigger.
 *
 * Deliberately NOT switch-aware: it stores what the fees say. The rules read the
 * switch themselves, so turning it off lifts every block at once without
 * rewriting a single feeBlocks doc, and turning it back on is equally instant.
 */
export async function recomputeFeeBlock(proId: string): Promise<number | null> {
  const ref = feeBlockRef(proId);
  return db.runTransaction(async (tx) => {
    const feesSnap = await tx.get(
      db.collectionGroup('fees').where('professionalId', '==', proId),
    );
    const blockedFrom = earliestOverdueAt(feesSnap.docs.map((d) => d.data() as FeeDoc));
    const current = await tx.get(ref);
    const currentMs = current.get('blockedFrom')?.toMillis?.() ?? null;
    if (current.exists && currentMs === blockedFrom) return blockedFrom;
    if (blockedFrom === null && !current.exists) return null;
    tx.set(ref, {
      blockedFrom: blockedFrom === null ? null : Timestamp.fromMillis(blockedFrom),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return blockedFrom;
  });
}

/**
 * recomputeFeeBlock for callers whose own write has ALREADY committed (a payment
 * recorded, a dispute resolved). A failure here must not turn a recorded payment
 * into an error the admin retries — the trigger recomputes again regardless.
 */
export async function recomputeFeeBlockSafely(proId: string): Promise<void> {
  try {
    await recomputeFeeBlock(proId);
  } catch (err) {
    console.error('[feeOverdue] direct recompute failed; trigger will retry', proId, err);
  }
}

/** Safety net: any write to any fee doc recomputes that professional's block. */
export const onFeeWrittenRecomputeBlock = onDocumentWritten(
  'projects/{projectId}/fees/{proId}',
  async (event) => {
    const before = event.data?.before.data() as FeeDoc | undefined;
    const after = event.data?.after.data() as FeeDoc | undefined;
    // The only writes that cannot change blockedFrom are the ones that leave
    // every field the predicate reads untouched — a marker stamp, the charge
    // stub's bookkeeping. Skip those, so the cron's own marker writes do not
    // each cost a transaction.
    if (before && after && effectiveOverdueAt(before) === effectiveOverdueAt(after)) return;
    const proId = after?.professionalId ?? before?.professionalId ?? event.params.proId;
    await recomputeFeeBlock(proId);
  },
);

// ── Notifications ────────────────────────────────────────────────────────────

export type Lang = 'he' | 'en';
type NoticeKind =
  | 'fee_created' | 'fee_created_nodate' | 'fee_due' | 'fee_overdue_soon' | 'fee_overdue';

/** What a notice says besides the amount: which project, and the date the block
 *  starts. `date` is already formatted (dd/mm/yyyy, Israel time). */
type NoticeCtx = { amount: number; project: string; date: string };

/** dd/mm/yyyy in Israel time — the zone every date the app shows uses. */
export function formatNoticeDate(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(ms));
}

/**
 * Push text. Every other server notification is hardcoded Hebrew, because the
 * app's language lives only on the device. This table holds both, and picks
 * `users/{uid}.language` if that field ever exists — today it does not, so
 * Hebrew is what goes out.
 */
const NOTICE_TEXT: Record<NoticeKind, Record<Lang, (c: NoticeCtx) => string>> = {
  fee_created: {
    he: (c) => `עמלת תיווך של ₪${c.amount} לפרויקט ${c.project} — לתשלום עד ${c.date}.`,
    en: (c) => `A ₪${c.amount} brokerage fee for ${c.project} — payable by ${c.date}.`,
  },
  // The block is switched off: there is no date and no restriction to mention —
  // only what is owed, for which project, and that it can be paid now.
  fee_created_nodate: {
    he: (c) => `עמלת תיווך של ₪${c.amount} לפרויקט ${c.project} ממתינה לתשלום. אפשר לשלם עכשיו באפליקציה.`,
    en: (c) => `A ₪${c.amount} brokerage fee for ${c.project} is waiting to be paid. You can pay now in the app.`,
  },
  fee_due: {
    he: (c) => `עמלת התיווך בסך ₪${c.amount} לפרויקט ${c.project} לתשלום. יש להסדיר אותה עד ${c.date} כדי להמשיך לקבל פרויקטים חדשים.`,
    en: (c) => `Your ₪${c.amount} brokerage fee for ${c.project} is now due. Settle it by ${c.date} to keep receiving new projects.`,
  },
  fee_overdue_soon: {
    he: (c) => `תזכורת: עמלת התיווך בסך ₪${c.amount} לפרויקט ${c.project} טרם שולמה. החל מ‑${c.date} לא ניתן יהיה לשלוח הצעות או להתקבל לפרויקטים חדשים עד להסדרתה.`,
    en: (c) => `Reminder: your ₪${c.amount} brokerage fee for ${c.project} is still unpaid. From ${c.date} you won't be able to send offers or be hired for new projects until it's settled.`,
  },
  fee_overdue: {
    he: (c) => `עמלת התיווך בסך ₪${c.amount} לפרויקט ${c.project} באיחור. שליחת הצעות וקבלה לפרויקטים חדשים מושהות עד להסדרתה. הפרויקטים הקיימים שלך ממשיכים כרגיל.`,
    en: (c) => `Your ₪${c.amount} brokerage fee for ${c.project} is overdue. Sending offers and being hired for new projects are paused until it's settled. Your current projects continue as normal.`,
  },
};

/** The project's title for a push, quoted; a generic word when it has none. */
async function projectLabel(projectId: string, lang: Lang): Promise<string> {
  try {
    const t = (await db.doc(`projects/${projectId}`).get()).get('title');
    if (typeof t === 'string' && t.trim()) return `"${t.trim()}"`;
  } catch { /* a push must not fail on a title lookup */ }
  return lang === 'he' ? 'הפרויקט' : 'the project';
}

export async function langOf(userId: string): Promise<Lang> {
  try {
    const v = (await db.doc(`users/${userId}`).get()).get('language');
    return v === 'en' ? 'en' : 'he';
  } catch {
    return 'he';
  }
}

/**
 * `blockAtMs`: the moment the block starts — the date the dated notices quote.
 * Only `fee_created_nodate` (block switched off) may omit it; both fee_created
 * kinds are delivered with the same push `type: 'fee_created'`.
 */
export async function sendFeeNotice(
  kind: NoticeKind, proId: string, projectId: string, amount: number, blockAtMs?: number,
): Promise<void> {
  if (blockAtMs === undefined && kind !== 'fee_created_nodate') {
    throw new Error(`sendFeeNotice(${kind}) needs the block date`);
  }
  const lang = await langOf(proId);
  await notify({
    userId: proId,
    title: 'BAMA',
    message: NOTICE_TEXT[kind][lang]({
      amount,
      project: await projectLabel(projectId, lang),
      date: blockAtMs === undefined ? '' : formatNoticeDate(blockAtMs),
    }),
    data: { type: kind === 'fee_created_nodate' ? 'fee_created' : kind, projectId },
  });
}

/**
 * The push sent the moment a fee is created (an engagement completes, or a
 * dispute resolves as completed, with something owed). ALWAYS sent when a fee is
 * owed: with the block on it names the date the block would start; with it off
 * (`blockAtMs` undefined — nothing was stamped) it says only what is owed, for
 * which project, and that it can be paid now — no date, no restriction.
 * Returns whether a push went out. Never throws: a failed push must not undo or
 * fail the completion that just committed.
 */
export async function notifyFeeCreated(
  proId: string, projectId: string, amount: number, blockAtMs: number | undefined,
): Promise<boolean> {
  if (!(amount > 0)) return false;
  try {
    await sendFeeNotice(
      blockAtMs === undefined ? 'fee_created_nodate' : 'fee_created',
      proId, projectId, amount, blockAtMs,
    );
    return true;
  } catch (err) {
    console.error('[feeOverdue] fee_created notice failed', proId, projectId, err);
    return false;
  }
}

const DAY = 86400_000;
const BATCH = 200;
/** How far back the due query looks. Hourly runs catch a fee within the hour;
 *  the slack covers missed runs. */
const DUE_LOOKBACK_MS = 2 * DAY;
/** How far back the block query looks. A fee whose block began longer ago than
 *  this has long since had its notice. */
const BLOCK_LOOKBACK_MS = 30 * DAY;
/** v2 sweep: how far past a block its notice can still be pending (weekend + chag),
 *  and how far ahead of one the window-end notice can go out. */
const V2_LOOKBACK_MS = 10 * DAY;
const V2_LOOKAHEAD_MS = 14 * DAY;

type Doc = admin.firestore.QueryDocumentSnapshot;

async function paginate(query: admin.firestore.Query, handler: (doc: Doc) => Promise<void>) {
  let last: Doc | undefined;
  for (;;) {
    let q = query.limit(BATCH);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) await handler(doc);
    if (snap.size < BATCH) break;
    last = snap.docs[snap.docs.length - 1];
  }
}

/** Which notice, if any, a fee is owed at `now`. Pure — the cron's whole decision. */
export function overdueNoticeFor(
  fee: FeeDoc, now: number, leadDays: number = DEFAULT_FEE_REMINDER_LEAD_DAYS,
): 'fee_overdue_soon' | 'fee_overdue' | null {
  // v2 fees have their own sequence (feeNoticeFor); the legacy sweep must not
  // double-send to them.
  if (fee.feeTimingVersion === 2) return null;
  const at = effectiveOverdueAt(fee);
  if (at === undefined) return null;
  if (now >= at) return fee.overdueBlockNotifiedAt ? null : 'fee_overdue';
  if (at - now <= leadDays * DAY) return fee.overdueWarnedAt || fee.overdueBlockNotifiedAt ? null : 'fee_overdue_soon';
  return null;
}

/** Is the "fee is now due" notice owed? Keyed on chargeDueAt (the end of the
 *  contest window), and only for fees the overdue rule actually covers. */
export function dueNoticeOwed(fee: FeeDoc, now: number): boolean {
  if (fee.dueNotifiedAt) return false;
  if (fee.feeTimingVersion === 2) return false;
  // Undefined also for a fee with no overdueAt — completed while the switch was off.
  if (effectiveOverdueAt(fee) === undefined) return false;
  const due = fee.chargeDueAt?.toMillis?.();
  return typeof due === 'number' && due <= now;
}

// ── Fee timing v2: the business-day notice sequence ──────────────────────────
//
//   A  window closed   — the first notice day at `hour`:00 after chargeDueAt
//   B  day before      — `hour`:00 on the business day before the block
//   C  block day       — `hour`:00 on the block's day
//   D  blocked         — the first notice day at `hour`:00 after overdueAt
//
// A "notice day" is any day but Saturday, a chag or Yom HaAtzmaut (Friday is fine).
// When A and B fall on the same Israeli calendar day they go out as ONE message.
// The block itself takes effect at overdueAt exactly; D only TELLS the professional.
// Nothing is sent for a fee that is paid, disputed or cancelled — effectiveOverdueAt
// is undefined for all of those, so they never reach here.

export type V2Kind =
  | 'window_end' | 'window_end_day_before' | 'day_before' | 'block_day' | 'blocked';
export type ReminderStage = 'windowEnd' | 'dayBefore' | 'blockDay' | 'blocked';
export type V2Plan = { kind: V2Kind; mark: ReminderStage[] };
export type V2Timing = { hour: number; extraNonBusinessDays: readonly string[] };

/** When each stage of the sequence is due for a fee. Pure. */
export function v2Schedule(windowEnd: number, blockAt: number, timing: V2Timing) {
  const rules: DayRules = { extraNonBusinessDays: timing.extraNonBusinessDays };
  const blockYmd = ymdOf(blockAt);
  const dayBeforeYmd = previousBusinessDay(blockYmd, rules);
  return {
    windowEnd: firstNoticeAtOrAfter(windowEnd, timing.hour, rules),
    dayBefore: instantAt(dayBeforeYmd, timing.hour),
    blockDay: instantAt(blockYmd, timing.hour),
    blocked: firstNoticeAtOrAfter(blockAt, timing.hour, rules),
    dayBeforeYmd,
  };
}

/**
 * Which notice, if any, a v2 fee is owed at `now`. Pure — the whole decision.
 *
 * At most one message per run: if several stages are due (the cron was down), only
 * the latest goes out and the earlier ones are marked done with it, so a recovered
 * cron never sends a stale "tomorrow" after the day has passed. After blockAt only
 * D remains.
 */
export function feeNoticeFor(fee: FeeDoc, now: number, timing: V2Timing): V2Plan | null {
  if (fee.feeTimingVersion !== 2) return null;
  const blockAt = effectiveOverdueAt(fee);
  const windowEnd = fee.chargeDueAt?.toMillis?.();
  if (blockAt === undefined || typeof windowEnd !== 'number') return null;
  const done = fee.reminders ?? {};
  const t = v2Schedule(windowEnd, blockAt, timing);

  if (now >= blockAt) {
    return now >= t.blocked && !done.blocked ? { kind: 'blocked', mark: ['blocked'] } : null;
  }
  const open = (stages: ReminderStage[]) => stages.filter((st) => !done[st]);

  if (now >= t.blockDay && !done.blockDay) {
    return { kind: 'block_day', mark: open(['windowEnd', 'dayBefore', 'blockDay']) };
  }
  // B only makes sense after the window has closed and A had its turn (t.dayBefore
  // >= t.windowEnd). Same-day with A -> one merged message.
  if (now >= t.dayBefore && t.dayBefore >= t.windowEnd && !done.dayBefore) {
    return done.windowEnd
      ? { kind: 'day_before', mark: ['dayBefore'] }
      : { kind: 'window_end_day_before', mark: ['windowEnd', 'dayBefore'] };
  }
  if (now >= t.windowEnd && !done.windowEnd) {
    return { kind: 'window_end', mark: ['windowEnd'] };
  }
  return null;
}

type V2Ctx = { amount: number; project: string; date: string };

const V2_TEXT: Record<V2Kind, Record<Lang, (c: V2Ctx) => string>> = {
  window_end: {
    he: (c) => `תקופת ההשגה על הפרויקט ${c.project} הסתיימה. עמלת התיווך בסך ₪${c.amount} לתשלום. יש לשלם עד ${c.date} כדי להמשיך לקבל פרויקטים חדשים.`,
    en: (c) => `The dispute window for ${c.project} has closed. Your ₪${c.amount} brokerage fee is due. Pay by ${c.date} to keep receiving new projects.`,
  },
  window_end_day_before: {
    he: (c) => `תקופת ההשגה על הפרויקט ${c.project} הסתיימה. עמלת התיווך בסך ₪${c.amount} לתשלום. יש לשלם עד מחר בסוף היום (${c.date}) כדי להמשיך לקבל פרויקטים חדשים.`,
    en: (c) => `The dispute window for ${c.project} has closed. Your ₪${c.amount} brokerage fee is due. Pay by the end of tomorrow (${c.date}) to keep receiving new projects.`,
  },
  day_before: {
    he: (c) => `תזכורת: מחר בסוף היום תיחסם האפשרות לקבל פרויקטים חדשים אם עמלת התיווך בסך ₪${c.amount} לפרויקט ${c.project} לא תשולם.`,
    en: (c) => `Reminder: tomorrow at the end of the day new projects will be blocked unless your ₪${c.amount} brokerage fee for ${c.project} is paid.`,
  },
  block_day: {
    he: (c) => `תזכורת: היום בסוף היום תיחסם האפשרות לקבל פרויקטים חדשים אם עמלת התיווך בסך ₪${c.amount} לפרויקט ${c.project} לא תשולם.`,
    en: (c) => `Reminder: today at the end of the day new projects will be blocked unless your ₪${c.amount} brokerage fee for ${c.project} is paid.`,
  },
  blocked: {
    he: (c) => `עמלת התיווך בסך ₪${c.amount} לפרויקט ${c.project} לא שולמה, ולכן לא ניתן כרגע לקבל פרויקטים חדשים או לשלוח הצעות. החסימה תוסר מיד עם התשלום. הפרויקטים הקיימים שלך ממשיכים כרגיל.`,
    en: (c) => `Your ₪${c.amount} brokerage fee for ${c.project} is unpaid, so you can't be hired for new projects or send offers right now. The block lifts the moment you pay. Your current projects continue as normal.`,
  },
};

/** Where to pay — appended to the DM only; the push itself opens the payment screen. */
const PAY_HINT: Record<Lang, string> = {
  he: ' לתשלום: באפליקציה, בהגדרות, תחת תשלום.',
  en: ' To pay: in the app, in Settings, under Payment.',
};

/** The push type each v2 notice is delivered as — existing, routed, essential. */
const V2_PUSH_TYPE: Record<V2Kind, 'fee_due' | 'fee_overdue_soon' | 'fee_overdue'> = {
  window_end: 'fee_due',
  window_end_day_before: 'fee_due',
  day_before: 'fee_overdue_soon',
  block_day: 'fee_overdue_soon',
  blocked: 'fee_overdue',
};

export const __V2_TEXT = V2_TEXT;

/**
 * Push + BAMA System DM to the professional. Deliberately NOTHING in the project's
 * group chat: the client must never learn that a professional owes BAMA money.
 * The DM raises no push of its own (the push above already opens the payment
 * screen), and a failed DM never loses the push.
 */
export async function sendV2Notice(
  kind: V2Kind, proId: string, projectId: string, amount: number, blockAtMs: number,
): Promise<void> {
  const lang = await langOf(proId);
  const text = V2_TEXT[kind][lang]({
    amount,
    project: await projectLabel(projectId, lang),
    date: formatEndOfDayHe(blockAtMs),
  });
  await notify({
    userId: proId, title: 'BAMA', message: text, data: { type: V2_PUSH_TYPE[kind], projectId },
  });
  try {
    // Loaded here, not at the top: ../system pulls in firebase-functions v1, which
    // nothing else in this module needs and which every importer would pay for.
    const { sendBamaSystemDM } = await import('../system');
    await sendBamaSystemDM(db, proId, text + PAY_HINT[lang], { push: false });
  } catch (err) {
    console.error('[feeOverdue] BAMA DM failed', kind, proId, err);
  }
}

/** The admin push for a fresh block. Never throws. */
export async function notifyAdminsOfBlock(
  proId: string, projectId: string, amount: number,
): Promise<void> {
  try {
    const uids = ADMIN_UIDS.value().filter(Boolean);
    if (uids.length === 0) {
      console.warn('[feeOverdue] ADMIN_UIDS is empty — no admin told of the block on', projectId);
      return;
    }
    const [pro, proj] = await Promise.all([
      db.doc(`users/${proId}`).get(), db.doc(`projects/${projectId}`).get(),
    ]);
    const name = (pro.data()?.displayName as string | undefined) || '—';
    const title = (proj.data()?.title as string | undefined) || '';
    await Promise.all(uids.map((userId) => notify({
      userId,
      title: 'BAMA',
      message: `נחסם: ${name} — עמלת תיווך ₪${amount}${title ? ` (${title})` : ''}`,
      data: { type: 'admin_fee_blocked', projectId, proId },
    })));
  } catch (err) {
    console.error('[feeOverdue] failed to alert admins of the block on', projectId, err);
  }
}

export async function runFeeOverdueSweep(
  now: number, leadDays: number = DEFAULT_FEE_REMINDER_LEAD_DAYS,
  timing: V2Timing = { hour: DEFAULT_REMINDER_HOUR_IL, extraNonBusinessDays: [] },
): Promise<void> {
  // 1) Fee is now due — the contest window just closed. Uses the existing
  //    (engagementStatus, chargeDueAt) collection-group index.
  await paginate(
    db.collectionGroup('fees')
      .where('engagementStatus', '==', 'completed')
      .where('chargeDueAt', '>', Timestamp.fromMillis(now - DUE_LOOKBACK_MS))
      .where('chargeDueAt', '<=', Timestamp.fromMillis(now))
      .orderBy('chargeDueAt'),
    async (doc) => {
      const fee = doc.data() as FeeDoc;
      const projectId = doc.ref.parent.parent?.id;
      if (!projectId || !dueNoticeOwed(fee, now)) return;
      // Marker first: a crash between the two loses a notice, never doubles one —
      // the same trade every lifecycleCron sweep makes.
      await doc.ref.update({ dueNotifiedAt: FieldValue.serverTimestamp() });
      await sendFeeNotice(
        'fee_due', doc.id, projectId, Math.max(0, fee.feeDue ?? 0),
        effectiveOverdueAt(fee) ?? now,
      );
    },
  );

  // 2) `leadDays` before the block (config feeReminderLeadDays), and the block
  //    itself. Needs the fees.overdueAt COLLECTION_GROUP field override.
  await paginate(
    db.collectionGroup('fees')
      .where('overdueAt', '>', Timestamp.fromMillis(now - BLOCK_LOOKBACK_MS))
      .where('overdueAt', '<=', Timestamp.fromMillis(now + leadDays * DAY))
      .orderBy('overdueAt'),
    async (doc) => {
      const fee = doc.data() as FeeDoc;
      const projectId = doc.ref.parent.parent?.id;
      if (!projectId) return;
      const kind = overdueNoticeFor(fee, now, leadDays);
      if (!kind) return;
      await doc.ref.update(
        kind === 'fee_overdue'
          ? { overdueBlockNotifiedAt: FieldValue.serverTimestamp() }
          : { overdueWarnedAt: FieldValue.serverTimestamp() },
      );
      await sendFeeNotice(
        kind, doc.id, projectId, Math.max(0, fee.feeDue ?? 0), effectiveOverdueAt(fee) ?? now,
      );
      // The block needs no write to START — the rule compares request.time — but
      // recompute anyway so feeBlocks is self-healing if a trigger was ever lost.
      if (kind === 'fee_overdue' && feeIsOverdue(fee, now)) {
        await recomputeFeeBlockSafely(doc.id);
      }
    },
  );

  // 3) Fee timing v2 — the business-day sequence (see feeNoticeFor). Same
  //    overdueAt window as above, but wider on both sides: a block can sit behind
  //    a weekend plus a chag before its notice day, and A goes out up to a week
  //    before the block.
  await paginate(
    db.collectionGroup('fees')
      .where('overdueAt', '>', Timestamp.fromMillis(now - V2_LOOKBACK_MS))
      .where('overdueAt', '<=', Timestamp.fromMillis(now + V2_LOOKAHEAD_MS))
      .orderBy('overdueAt'),
    async (doc) => {
      const fee = doc.data() as FeeDoc;
      const projectId = doc.ref.parent.parent?.id;
      if (!projectId || fee.feeTimingVersion !== 2) return;
      const blockAt = effectiveOverdueAt(fee);
      if (blockAt === undefined) return;
      // The block starts at blockAt on its own (the rule compares request.time);
      // recompute anyway, once it has passed, so feeBlocks heals if a trigger was lost.
      if (now >= blockAt && !fee.reminders?.blocked) await recomputeFeeBlockSafely(doc.id);

      const plan = feeNoticeFor(fee, now, timing);
      if (!plan) return;
      // Markers first: a crash between the two loses a notice, never doubles one.
      const marks: Record<string, unknown> = {};
      for (const st of plan.mark) marks[`reminders.${st}`] = FieldValue.serverTimestamp();
      await doc.ref.update(marks);
      const amount = Math.max(0, fee.feeDue ?? 0);
      await sendV2Notice(plan.kind, doc.id, projectId, amount, blockAt);
      if (plan.kind === 'blocked') await notifyAdminsOfBlock(doc.id, projectId, amount);
    },
  );
}

/**
 * Hourly, not inside the daily lifecycleCron: "N days before" and "the block
 * started" are only worth sending close to the moment they describe.
 */
export const feeOverdueCron = onSchedule(
  { schedule: 'every 60 minutes', timeZone: TIMEZONE },
  async () => {
    const config = await readConfig();
    if (!config.feeOverdueBlockEnabled) return;
    await runFeeOverdueSweep(Date.now(), config.feeReminderLeadDays, {
      hour: config.reminderHourIL, extraNonBusinessDays: config.extraNonBusinessDays,
    });
  },
);

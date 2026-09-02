import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, FieldValue, daysAgo, notify, feesCol } from './helpers';
import { confirmCompletionInternal } from './completion';
import {
  AUTO_CONFIRM_DAYS, COMPLETION_REMINDER_DAYS, END_DATE_PROMPT_GRACE_DAYS,
  ARCHIVE_UNCONFIRMED_DAYS, REVIEW_FORCE_PUBLISH_DAYS, TIMEZONE,
} from '../pricing';

const BATCH = 200;
type Query = admin.firestore.Query;
type Doc = admin.firestore.QueryDocumentSnapshot;

/** Page through a query in BATCH-sized chunks; `handler` runs per doc. Bounded, no full scans. */
async function paginate(query: Query, handler: (doc: Doc) => Promise<void>): Promise<void> {
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

/**
 * Daily lifecycle sweep (Asia/Jerusalem). Every action is a conditional write that
 * re-checks state, so a second run on the same day is a no-op. Each query is bounded
 * to one date field + a state filter, ordered, and paginated (no unbounded scans).
 */
export const lifecycleCron = onSchedule(
  { schedule: 'every day 03:00', timeZone: TIMEZONE },
  async () => {
    // 1) Expected-end-date prompt: hired, nobody has acted, end date passed + grace.
    await paginate(
      db.collection('projects')
        .where('slotActive', '==', true)
        .where('completion.state', '==', 'none')
        .where('expectedEndDate', '<', daysAgo(END_DATE_PROMPT_GRACE_DAYS))
        .orderBy('expectedEndDate'),
      async (doc) => {
        const p = doc.data();
        if (p.endDatePromptedAt) return; // already prompted (idempotent)
        await doc.ref.update({ endDatePromptedAt: FieldValue.serverTimestamp() });
        await notify({ userId: p.clientId, title: 'BAMA', message: 'האם הפרויקט הסתיים?', data: { type: 'system', chatId: p.chatId ?? '' } });
      },
    );

    // 2) Completion reminders (day 3/6) + auto-confirm (day 7) for pro-requested projects.
    await paginate(
      db.collection('projects')
        .where('completion.state', '==', 'requested')
        .where('completion.requestedAt', '<', daysAgo(COMPLETION_REMINDER_DAYS[0]))
        .orderBy('completion.requestedAt'),
      async (doc) => {
        const p = doc.data();
        const requestedAt: admin.firestore.Timestamp | undefined = p.completion?.requestedAt;
        if (!requestedAt) return;
        if (requestedAt.toMillis() <= daysAgo(AUTO_CONFIRM_DAYS).toMillis()) {
          await confirmCompletionInternal(doc.id, 'auto'); // idempotent
          return;
        }
        const reminded: number[] = p.completion?.remindedDays ?? [];
        for (const day of COMPLETION_REMINDER_DAYS) {
          if (requestedAt.toMillis() <= daysAgo(day).toMillis() && !reminded.includes(day)) {
            await doc.ref.update({ 'completion.remindedDays': FieldValue.arrayUnion(day) });
            await notify({ userId: p.clientId, title: 'BAMA', message: 'תזכורת: האם הפרויקט הסתיים?', data: { type: 'system', chatId: p.chatId ?? '' } });
          }
        }
      },
    );

    // 3) Archive unconfirmed: hired, nobody acted, 45 days past end date → every
    //    pro's slot frees, no fee is due from any of them. Clearing the derived
    //    boolean alone would leave the per-pro fee docs still holding slots, so
    //    each one is voided too.
    await paginate(
      db.collection('projects')
        .where('slotActive', '==', true)
        .where('completion.state', '==', 'none')
        .where('expectedEndDate', '<', daysAgo(ARCHIVE_UNCONFIRMED_DAYS))
        .orderBy('expectedEndDate'),
      async (doc) => {
        const feesSnap = await feesCol(doc.id).get();
        const batch = db.batch();
        batch.update(doc.ref, {
          slotHolders: [],
          slotActive: false,
          archivedUnconfirmedAt: FieldValue.serverTimestamp(),
        });
        feesSnap.docs.forEach((f) => batch.update(f.ref, { slotActive: false, feeDue: 0 }));
        await batch.commit();
      },
    );

    // 4) Force-publish held reviews after 60 days, even if never paid.
    await paginate(
      db.collection('reviews')
        .where('published', '==', false)
        .where('createdAt', '<', daysAgo(REVIEW_FORCE_PUBLISH_DAYS))
        .orderBy('createdAt'),
      async (doc) => {
        await doc.ref.update({ published: true, visibleAt: FieldValue.serverTimestamp() });
      },
    );
  },
);

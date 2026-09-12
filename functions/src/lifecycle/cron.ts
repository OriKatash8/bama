import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, FieldValue, daysAgo, notify, feesCol , type FeeDoc } from './helpers';
import { remindersDueFor, applyDerivedProjectState } from './derive';
import { completeEngagementInternal } from './completion';
import { chargeEngagementFee } from './charge';
import { readConfig } from './config';
import {
  AUTO_CONFIRM_DAYS, COMPLETION_REMINDER_DAYS, END_DATE_PROMPT_GRACE_DAYS,
  ARCHIVE_UNCONFIRMED_DAYS, REVIEW_FORCE_PUBLISH_DAYS, TIMEZONE,
  END_DATE_REMINDER_DAYS,
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

    // 2) TEMPORARY IN PART — dies with the requestCompletion alias.
    //
    //    Since the completion trigger moved to the professional (sweep 5 below),
    //    the client is no longer asked to confirm anything, so the 'finished'
    //    half of this sweep is reachable only through that legacy alias. The
    //    'withdrawing' half is live and stays — a professional asking to leave
    //    still needs an answer, and a client who does not give one still needs
    //    chasing. See remindersDueFor for what to delete alongside the alias.
    //
    //    Completion reminders (day 3/6) for pro-requested projects, then hand an
    //    unanswered request to a human on day 7.
    //
    //    This used to AUTO-CONFIRM on day 7. It no longer does. Confirming a
    //    completion the client never answered also mints a fee record the client
    //    never agreed to, and marks work delivered on the strength of silence.
    //    An unanswered request is now flagged for admin review instead; the
    //    project stays as it is until someone looks at it.
    await paginate(
      db.collection('projects')
        .where('completion.state', '==', 'requested')
        .where('completion.requestedAt', '<', daysAgo(COMPLETION_REMINDER_DAYS[0]))
        .orderBy('completion.requestedAt'),
      async (doc) => {
        const p = doc.data();
        // The project-level cache SELECTED this project; it does not decide
        // anything beyond that. Every judgement below is made on an engagement's
        // own requestedAt and its own remindedDays, because the cache can be
        // stale by the time the cron reads it — applyDerivedProjectState is
        // deliberately not atomic with the transition that triggered it.
        const feesSnap = await feesCol(doc.id).get();
        const engagements = feesSnap.docs.map((d) => ({
          ref: d.ref, ...(d.data() as FeeDoc),
        }));
        const actions = remindersDueFor(
          engagements, Date.now(), COMPLETION_REMINDER_DAYS, AUTO_CONFIRM_DAYS,
        );
        if (actions.length === 0) return;   // stale cache, no live work — do nothing

        const byPro = new Map(engagements.map((e) => [e.professionalId as string, e.ref]));
        for (const a of actions) {
          const ref = byPro.get(a.proId);
          if (!ref) continue;
          if (a.kind === 'escalate') {
            // Flagged on the ENGAGEMENT. One professional's unanswered request no
            // longer puts the whole project in front of a human on everyone else's
            // behalf.
            await ref.update({
              adminReviewPending: true,
              adminReview: {
                reason: 'completion_unanswered',
                at: FieldValue.serverTimestamp(),
              },
            });
          } else {
            await ref.update({ 'completion.remindedDays': FieldValue.arrayUnion(a.day) });
            // "Did the project finish?" is the wrong question for a professional
            // asking to LEAVE — the client is being asked to release them, not to
            // confirm delivery, and answering the wrong question is how a
            // withdrawal gets accepted as a completion.
            const eng = engagements.find((x) => x.professionalId === a.proId);
            const leaving = eng?.completion?.endKind === 'withdrawing';
            await notify({
              userId: p.clientId,
              title: 'BAMA',
              message: leaving
                ? 'תזכורת: בעל/ת מקצוע ביקש/ה לפרוש מהפרויקט'
                : 'תזכורת: האם הפרויקט הסתיים?',
              data: { type: 'system', chatId: p.chatId ?? '' },
            });
          }
        }
        await applyDerivedProjectState(doc.id);
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
        // `status: 'not_owed'` alongside feeDue, matching cancelProject and freeSlot.
      // Without it this sweep left a voided fee that still read as settleable —
      // the one terminal path of the three that did not say so explicitly.
      feesSnap.docs.forEach((f) => batch.update(f.ref, {
        slotActive: false, feeDue: 0, status: 'not_owed',
      }));
        await batch.commit();
      },
    );

    // 4b) END-DATE REMINDERS to the CLIENT, 2 days and 1 day out. This is the
    //     only completion-adjacent thing the client is asked to do now: not to
    //     confirm, only to move the date if it is wrong. Once it passes, the
    //     engagements auto-complete without them.
    //
    //     Guarded per project by endDateRemindedDays, not per engagement — the
    //     date is a property of the project and the recipient is one person.
    for (const daysOut of END_DATE_REMINDER_DAYS) {
      const from = admin.firestore.Timestamp.fromMillis(Date.now() + (daysOut - 1) * 86400_000);
      const to = admin.firestore.Timestamp.fromMillis(Date.now() + daysOut * 86400_000);
      await paginate(
        db.collection('projects')
          .where('endDate', '>', from)
          .where('endDate', '<=', to)
          .orderBy('endDate'),
        async (doc) => {
          const p = doc.data();
          if (p.status !== 'open' && p.status !== 'in_progress') return;
          const sent: number[] = p.endDateRemindedDays ?? [];
          if (sent.includes(daysOut)) return;
          await doc.ref.update({
            endDateRemindedDays: FieldValue.arrayUnion(daysOut),
          });
          await notify({
            userId: p.clientId,
            title: 'BAMA',
            message: daysOut === 1
              ? 'הפרויקט מסתיים מחר. אם התאריך אינו נכון, אפשר לעדכן אותו עכשיו.'
              : `הפרויקט מסתיים בעוד ${daysOut} ימים. אם התאריך אינו נכון, אפשר לעדכן אותו עכשיו.`,
            data: { type: 'end_date_soon', projectId: doc.id, chatId: p.chatId ?? '' },
          });
        },
      );
    }

    // 5) AUTO-COMPLETE: the deadline backstop for a professional who never
    //    marked their own engagement. Collection-group over engagements, because
    //    completionDueAt lives on the engagement — the project has no single
    //    deadline once each engagement carries its own.
    //
    //    An engagement with NO completionDueAt is never selected, which is every
    //    engagement on a project with no endDate, including all of the ones that
    //    predate this. Absent means "waits for the professional", forever.
    await paginate(
      db.collectionGroup('fees')
        .where('engagementStatus', '==', 'hired')
        .where('completionDueAt', '<', admin.firestore.Timestamp.now())
        .orderBy('completionDueAt'),
      async (doc) => {
        const projectId = doc.ref.parent.parent?.id;
        if (!projectId) return;
        const res = await completeEngagementInternal(projectId, doc.id, 'auto');
        if (!res.completed) return;
        const { chargeWindowDays } = await readConfig();
        await notify({
          userId: doc.id,
          title: 'BAMA',
          message: `הפרויקט הסתיים. עמלת הפלטפורמה תיגבה בעוד ${chargeWindowDays} ימים — אם העבודה לא בוצעה, סמנו זאת עכשיו.`,
          data: { type: 'engagement_completed', projectId },
        });
      },
    );

    // 6) CHARGE: the window has closed. chargeEngagementFee is a stub that takes
    //    no money and records what it would have taken — and what would have
    //    stopped it. The engagement is left alone by a failure; nothing here
    //    changes state, because a charge that did not happen must not look like
    //    one that did.
    await paginate(
      db.collectionGroup('fees')
        .where('engagementStatus', '==', 'completed')
        .where('chargeDueAt', '<', admin.firestore.Timestamp.now())
        .orderBy('chargeDueAt'),
      async (doc) => {
        const fee = doc.data() as FeeDoc;
        if (fee.feePaid === true || fee.status === 'paid') return;   // already settled
        if (fee.chargeAttemptCount) return;                          // already attempted
        const projectId = doc.ref.parent.parent?.id;
        if (!projectId) return;
        const attempt = await chargeEngagementFee(projectId, doc.id);
        if (attempt.outcome === 'would_fail_no_card') {
          await notify({
            userId: doc.id,
            title: 'BAMA',
            message: 'לא הצלחנו לגבות את עמלת הפלטפורמה. יש להסדיר את אמצעי התשלום.',
            data: { type: 'charge_failed', projectId },
          });
        }
      },
    );

    // 4) Backstop: publish anything still marked held.
    //
    //    Nothing should ever be held now — onReviewCreate publishes every review
    //    on creation. This stays as a safety net for a document written before
    //    that change, or by some path nobody anticipated. It is not a lever.
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

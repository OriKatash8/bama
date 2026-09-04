import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';
import {
  seedRoleSkills,
  getVacantSlots,
  professionalMatchesAnyVacantSlot,
  type RoleSkillEntry,
} from '../matching';
import { SYSTEM_USER_ID } from '../system';

async function createNotification(
  db: admin.firestore.Firestore,
  payload: {
    userId: string;
    title: string;
    message: string;
    data?: Record<string, string>;
  }
): Promise<void> {
  await db.collection('notifications').add({
    userId: payload.userId,
    title: payload.title,
    message: payload.message,
    data: payload.data ?? {},
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const onNewChatMessage = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data() as {
      senderId?: string;
      text?: string;
      imageURL?: string;
      audioUrl?: string;
      videoUrl?: string;
      system?: boolean;
    };

    if (!message.senderId) return;
    // System messages (new mission/meeting) and BAMA System DMs are notified via
    // their own triggers/helpers.
    if (message.system || message.senderId === 'system' || message.senderId === SYSTEM_USER_ID) return;

    const { chatId } = context.params;
    const db = admin.firestore();

    const [senderDoc, chatDoc] = await Promise.all([
      db.collection('users').doc(message.senderId).get(),
      db.collection('chats').doc(chatId).get(),
    ]);

    if (!chatDoc.exists) return;

    const senderName: string = (senderDoc.data()?.displayName as string | undefined) ?? 'BAMA';
    const members: string[] = (chatDoc.data()?.members as string[] | undefined) ?? [];

    let body: string;
    if (message.imageURL) {
      body = 'שלח לך תמונה';
    } else if (message.audioUrl) {
      body = 'שלח לך הודעה קולית';
    } else if (message.videoUrl) {
      body = 'שלח לך וידאו';
    } else {
      const text = message.text ?? '';
      body = text.length > 100 ? text.slice(0, 97) + '...' : text;
    }

    const recipients = members.filter((uid) => uid !== message.senderId);
    await Promise.all(
      recipients.map((userId) =>
        createNotification(db, {
          userId,
          title: senderName,
          message: body,
          data: { type: 'message', chatId },
        })
      )
    );
  });

export const onNewPriceOffer = functions.firestore
  .document('priceOffers/{offerId}')
  .onCreate(async (snap, context) => {
    const offer = snap.data() as {
      projectId?: string;
      professionalId?: string;
    };

    if (!offer.projectId || !offer.professionalId) return;

    const db = admin.firestore();

    const [projectDoc, professionalDoc] = await Promise.all([
      db.collection('projects').doc(offer.projectId).get(),
      db.collection('users').doc(offer.professionalId).get(),
    ]);

    if (!projectDoc.exists) return;

    const clientId: string | undefined = projectDoc.data()?.clientId as string | undefined;
    const projectTitle: string = (projectDoc.data()?.title as string | undefined) ?? '';
    if (!clientId) return;
    if (clientId === offer.professionalId) return;

    const professionalName: string =
      (professionalDoc.data()?.displayName as string | undefined) ?? 'בעל מקצוע';

    await createNotification(db, {
      userId: clientId,
      title: 'הצעת מחיר חדשה',
      message: `${professionalName} הגיש הצעה לפרויקט ${projectTitle}`,
      data: { type: 'offer', projectId: offer.projectId, offerId: context.params.offerId },
    });
  });

export const onPriceOfferAccepted = functions.firestore
  .document('priceOffers/{offerId}')
  .onUpdate(async (change) => {
    const before = change.before.data() as { status?: string; projectId?: string; professionalId?: string };
    const after = change.after.data() as { status?: string; projectId?: string; professionalId?: string };

    if (before.status === 'accepted' || after.status !== 'accepted') return;
    if (!after.projectId || !after.professionalId) return;

    const db = admin.firestore();
    const projectDoc = await db.collection('projects').doc(after.projectId).get();
    if (!projectDoc.exists) return;

    const projectTitle: string = (projectDoc.data()?.title as string | undefined) ?? '';
    const clientId: string | undefined = projectDoc.data()?.clientId as string | undefined;
    if (after.professionalId === clientId) return;

    // chatId lets the tap open the project's group chat (same source as the
    // mission/meeting triggers). Absent on very old projects → the client
    // router falls back to the dashboard.
    const chatId: string | undefined = projectDoc.data()?.chatId as string | undefined;

    await createNotification(db, {
      userId: after.professionalId,
      title: 'ההצעה שלך התקבלה 🎉',
      message: `ההצעה שלך לפרויקט ${projectTitle} התקבלה`,
      data: { type: 'offer_accepted', projectId: after.projectId, ...(chatId ? { chatId } : {}) },
    });
  });

export const onMarketplacePurchase = functions.firestore
  .document('marketplace_listings/{listingId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() as { status?: string };
    const after = change.after.data() as {
      status?: string;
      posterId?: string;
      buyerId?: string;
      productName?: string;
    };

    if (before.status === 'reserved' || after.status !== 'reserved') return;
    if (!after.posterId || !after.buyerId) return;
    if (after.posterId === after.buyerId) return;

    const productName: string = after.productName ?? 'המוצר';

    await createNotification(admin.firestore(), {
      userId: after.posterId,
      title: 'רכישה חדשה',
      message: `מישהו רכש את ${productName} שלך`,
      data: { type: 'purchase', listingId: context.params.listingId },
    });
  });

/**
 * Posts a system message into a project's group chat and notifies every member
 * except the creator. Mirrors chatService.sendMessage's lastMessage/unreadCount
 * shape so the notice shows in the chat-list preview.
 */
async function announceProjectEvent(
  db: admin.firestore.Firestore,
  params: {
    projectId: string;
    createdBy?: string;
    systemText: string;
    notifTitle: string;
    buildMessage: (projectTitle: string) => string;
    notifData: (chatId: string) => Record<string, string>;
    /** Who gets the push. Defaults to every chat member except `createdBy`.
     *  Set explicitly when an event concerns ONE member — a removal request must
     *  not push to the rest of the crew. The system message still goes to the
     *  thread either way; only the notification is narrowed. */
    recipients?: string[];
  }
): Promise<void> {
  const projectDoc = await db.collection('projects').doc(params.projectId).get();
  if (!projectDoc.exists) return;

  const chatId = projectDoc.data()?.chatId as string | undefined;
  const projectTitle: string = (projectDoc.data()?.title as string | undefined) ?? '';
  if (!chatId) return;

  const chatDoc = await db.collection('chats').doc(chatId).get();
  if (!chatDoc.exists) return;

  const members: string[] = (chatDoc.data()?.members as string[] | undefined) ?? [];
  if (members.length === 0) return;

  const notRecipient = (uid: string) => !!params.createdBy && uid === params.createdBy;

  // 1) System message in the thread
  await db.collection('chats').doc(chatId).collection('messages').add({
    senderId: 'system',
    system: true,
    text: params.systemText,
    timestamp: FieldValue.serverTimestamp(),
    readBy: [],
  });

  // 2) Chat metadata — lastMessage preview + unread bump for everyone but the creator
  const chatUpdate: Record<string, unknown> = {
    lastMessage: {
      text: params.systemText,
      senderId: 'system',
      timestamp: FieldValue.serverTimestamp(),
    },
  };
  for (const uid of members) {
    if (!notRecipient(uid)) {
      chatUpdate[`unreadCount.${uid}`] = FieldValue.increment(1);
    }
  }
  await db.collection('chats').doc(chatId).update(chatUpdate);

  // 3) Push notifications — an explicit list when the event concerns one member,
  //    otherwise everyone but the creator.
  const recipients = params.recipients
    ? params.recipients.filter((uid) => members.includes(uid))
    : members.filter((uid) => !notRecipient(uid));
  await Promise.all(
    recipients.map((userId) =>
      createNotification(db, {
        userId,
        title: params.notifTitle,
        message: params.buildMessage(projectTitle),
        data: params.notifData(chatId),
      })
    )
  );
}

/**
 * New open (non-direct) project → notify every professional who matches ANY vacant
 * slot (capability-aware, via the shared matching mirror). Direct-invite projects
 * (targetProfessionalId) are handled separately.
 */
export const onProjectCreate = functions.firestore
  .document('projects/{projectId}')
  .onCreate(async (snap, context) => {
    const project = snap.data() as {
      status?: string;
      targetProfessionalId?: string | null;
      clientId?: string;
      title?: string;
      crewSlots?: Array<{ category: string; quantity: number; requiredCapability?: string }>;
      filledSlots?: Array<{ category: string; requiredCapability?: string }>;
    };

    if (project.status !== 'open') return;
    if (project.targetProfessionalId) return; // direct-invite handled separately

    const { projectId } = context.params;
    const db = admin.firestore();

    const vacant = getVacantSlots(project);
    if (vacant.length === 0) return;

    const clientId = project.clientId;
    const title = project.title ?? '';
    const usersSnap = await db.collection('users').get();

    await Promise.all(
      usersSnap.docs.map(async (userDoc) => {
        const uid = userDoc.id;
        if (uid === clientId) return;
        // 'project' is optional — skip opted-out users (free: userDoc already loaded),
        // avoiding a notification doc the sender would only read again to discard.
        const prefs = userDoc.data()?.notifPrefs as Record<string, boolean> | undefined;
        if (prefs?.project === false) return;
        const profileDoc = await db
          .collection('users').doc(uid)
          .collection('profile').doc('data').get();
        if (!profileDoc.exists) return;
        const p = profileDoc.data() as {
          roleSkills?: RoleSkillEntry[];
          skills?: { category: string }[];
        };
        const roleSkills = seedRoleSkills(p.roleSkills, p.skills);
        if (!professionalMatchesAnyVacantSlot(roleSkills, vacant)) return;
        await createNotification(db, {
          userId: uid,
          title: 'פרויקט חדש',
          message: `פרויקט חדש שמתאים לך: ${title}`,
          data: { type: 'project', projectId },
        });
      }),
    );
  });

/**
 * A client asks a professional to leave a project.
 *
 * Until this existed the request document was written and NOTHING surfaced it:
 * no push, no chat message, no trigger. The professional only ever found out by
 * independently opening the project-details screen, so `freeSlot` was never
 * called and the slot was never released.
 *
 * onWrite, NOT onCreate. After the rules were widened so a client can re-request,
 * a repeat press is an UPDATE — an onCreate trigger would stay silent on exactly
 * the retry that feature exists to enable. `requestRemoval` rewrites
 * `createdAt: serverTimestamp()` on every press, so a changed timestamp is the
 * re-request signal.
 *
 * The push goes ONLY to the professional being removed; the rest of the crew
 * have no business being notified that a colleague was asked to leave. The
 * system message still lands in the shared project thread.
 */
export const onRemovalRequest = functions.firestore
  .document('projects/{projectId}/removalRequests/{professionalId}')
  .onWrite(async (change, context) => {
    const after = change.after.exists
      ? (change.after.data() as { status?: string; createdAt?: admin.firestore.Timestamp; requestedBy?: string })
      : null;
    if (!after) return;                        // deleted (freeSlot clears it)
    if (after.status !== 'pending') return;    // only an open request is announced

    if (change.before.exists) {
      const before = change.before.data() as { createdAt?: admin.firestore.Timestamp };
      const same =
        !!before.createdAt && !!after.createdAt && before.createdAt.isEqual(after.createdAt);
      if (same) return;                        // nothing was re-requested
    }

    const { projectId, professionalId } = context.params;

    await announceProjectEvent(admin.firestore(), {
      projectId,
      createdBy: after.requestedBy,
      systemText: '👋 נשלחה בקשה לסיום השתתפות בפרויקט',
      notifTitle: 'בקשה לסיום השתתפות',
      buildMessage: (projectTitle) => `התבקשת לסיים את השתתפותך בפרויקט ${projectTitle}`,
      notifData: (chatId) => ({ type: 'removal', projectId, chatId }),
      // Only the professional being removed.
      recipients: [professionalId],
    });
  });

export const onMissionCreate = functions.firestore
  .document('projects/{projectId}/missions/{missionId}')
  .onCreate(async (snap, context) => {
    const mission = snap.data() as { title?: string; createdBy?: string };
    const { projectId } = context.params;

    await announceProjectEvent(admin.firestore(), {
      projectId,
      createdBy: mission.createdBy,
      systemText: `📋 משימה חדשה: ${mission.title ?? ''}`,
      notifTitle: 'משימה חדשה',
      buildMessage: (projectTitle) => `נוספה משימה חדשה בפרויקט ${projectTitle}`,
      notifData: (chatId) => ({ type: 'mission', projectId, chatId }),
    });
  });

export const onMeetingCreate = functions.firestore
  .document('projects/{projectId}/meetings/{meetingId}')
  .onCreate(async (snap, context) => {
    const meeting = snap.data() as {
      title?: string;
      date?: string;
      time?: string;
      createdBy?: string;
    };
    const { projectId } = context.params;

    await announceProjectEvent(admin.firestore(), {
      projectId,
      createdBy: meeting.createdBy,
      systemText: `📅 פגישה חדשה: ${meeting.title ?? ''} · ${meeting.date ?? ''} ${meeting.time ?? ''}`,
      notifTitle: 'פגישה חדשה',
      buildMessage: (projectTitle) => `נקבעה פגישה חדשה בפרויקט ${projectTitle}`,
      notifData: (chatId) => ({ type: 'meeting', projectId, chatId }),
    });
  });

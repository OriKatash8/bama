import {
  collection,
  query,
  where,
  orderBy,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  DocumentData,
  QueryDocumentSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../../core/firebase/config';
import type { Chat, Message } from '../types';
import { logOwnerJoin, withEvents } from './communityMembership';

function docToMessage(doc: QueryDocumentSnapshot<DocumentData>): Message {
  const data = doc.data();
  return {
    id: doc.id,
    senderId: data.senderId,
    text: data.text,
    imageURL: data.imageURL,
    videoUrl: data.videoUrl,
    audioUrl: data.audioUrl,
    audioDuration: data.audioDuration,
    timestamp: data.timestamp,
    readBy: data.readBy ?? [],
    system: data.system ?? false,
    mentions: data.mentions,
    mentionsEveryone: data.mentionsEveryone,
    replyTo: data.replyTo,
    // The closing contact list (onProjectClosed). Written by the server only.
    kind: data.kind === 'project_closed' ? 'project_closed' : undefined,
    closedAs: data.closedAs,
    team: Array.isArray(data.team) ? data.team : undefined,
    contactEmail: data.contactEmail,
  };
}

/**
 * The same job as `docToMessage`, for `chats/{id}/channels/{cid}/messages`.
 *
 * Two mappers rather than one because the two collections genuinely differ: a
 * channel message never carries audio or `system`, and only a channel message
 * carries the shared-listing payload. They are side by side here so the
 * difference is visible — it used to live inline in ChatRoomScreen, where
 * adding a field to one and forgetting the other was invisible until a bubble
 * rendered wrong.
 *
 * Lives here, and exported, so it can be tested without rendering the screen.
 */
export function channelDocToMessage(id: string, data: DocumentData): Message {
  return {
    id,
    senderId: data.senderId as string,
    text: (data.text as string) ?? '',
    timestamp: data.timestamp as Message['timestamp'],
    readBy: (data.readBy as string[]) ?? [],
    imageURL: data.imageURL as string | undefined,
    videoUrl: data.videoUrl as string | undefined,
    mentions: data.mentions as string[] | undefined,
    mentionsEveryone: data.mentionsEveryone as boolean | undefined,
    replyTo: data.replyTo as Message['replyTo'],
    // Shared marketplace listing (Part B/C)
    type: data.type as 'listing' | undefined,
    listingId: data.listingId as string | undefined,
    title: data.title as string | undefined,
    price: data.price as number | undefined,
    imageUrl: data.imageUrl as string | null | undefined,
    posterId: data.posterId as string | undefined,
    posterName: data.posterName as string | undefined,
  };
}

function docToChat(doc: QueryDocumentSnapshot<DocumentData>): Chat {
  const data = doc.data();
  return {
    id: doc.id,
    type: data.type,
    members: data.members,
    communityId: data.communityId ?? null,
    ownerId: data.ownerId,
    projectId: data.projectId,
    name: data.name,
    photoURL: data.photoURL,
    roles: data.roles,
    lastMessage: data.lastMessage ?? null,
    createdAt: data.createdAt,
    unreadCount: data.unreadCount,
    purchaseListingId: data.purchaseListingId,
    buyerName: data.buyerName,
    archived: data.archived ?? false,
    archiveReason: data.archiveReason ?? null,
    hiddenFor: data.hiddenFor,
    // Completion is read off the CHAT doc, which is live-subscribed, precisely to
    // avoid the chat list's project fetch — that is cached per chat id and never
    // refetched. Omitting these left `readOnly` permanently undefined, so the
    // list silently fell back to the stale project status it was meant to bypass.
    //
    // Nothing here is type-checked: DocumentData's fields are `any`, so a missing
    // one widens away rather than erroring. Adding a field to Chat does NOT mean
    // it arrives — it has to be mapped here too.
    readOnly: data.readOnly ?? false,
    readOnlyReason: data.readOnlyReason,
  };
}

/** Soft-delete: hide a chat from one user's list without removing it for others. */
export async function hideChatForUser(chatId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId), {
    hiddenFor: arrayUnion(userId),
  });
}

export async function getOrCreateDM(
  currentUserId: string,
  otherUserId: string
): Promise<string> {
  const chatsRef = collection(db, 'chats');

  const q = query(
    chatsRef,
    where('type', '==', 'dm'),
    where('members', 'array-contains', currentUserId)
  );

  const snapshot = await getDocs(q);
  const existing = snapshot.docs.find((doc) =>
    (doc.data().members as string[]).includes(otherUserId)
  );

  if (existing) {
    return existing.id;
  }

  const newChat = await addDoc(chatsRef, {
    type: 'dm',
    members: [currentUserId, otherUserId],
    lastMessage: null,
    createdAt: serverTimestamp(),
  });

  return newChat.id;
}

export async function createPurchaseChat(
  buyerId: string,
  sellerId: string,
  listingId: string,
  productName: string,
  buyerName: string,
): Promise<string> {
  const ref = await addDoc(collection(db, 'chats'), {
    type: 'purchase' as const,
    members: [buyerId, sellerId],
    purchaseListingId: listingId,
    name: productName,
    buyerName,
    lastMessage: null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function createProjectGroup(
  clientId: string,
  professionalId: string,
  projectId: string,
  projectName: string,
): Promise<string> {
  const chatsRef = collection(db, 'chats');
  const newChat = await addDoc(chatsRef, {
    type: 'group' as const,
    name: projectName,
    projectId,
    members: [clientId, professionalId],
    roles: { [clientId]: 'admin' as const },
    lastMessage: null,
    createdAt: serverTimestamp(),
  });
  return newChat.id;
}

export async function createCommunityChat(
  name: string,
  description: string,
  ownerId: string,
  photoURL?: string,
  category?: string,
): Promise<string> {
  // One batch with the owner's 'join', so the dashboard's member log starts at
  // creation — best-effort, like every membership event (see withEvents).
  const ref = doc(collection(db, 'chats'));
  await withEvents('create community', async (events) => {
    const batch = writeBatch(db);
    batch.set(ref, {
      type: 'community' as const,
      name,
      description,
      ownerId,
      members: [ownerId],
      lastMessage: null,
      createdAt: serverTimestamp(),
      ...(photoURL ? { photoURL } : {}),
      ...(category ? { category } : {}),
    });
    if (events) logOwnerJoin(batch, ref.id, ownerId);
    await batch.commit();
  });
  return ref.id;
}

export async function addMemberToGroup(chatId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId), {
    members: arrayUnion(userId),
  });
}

export async function removeMemberFromGroup(chatId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId), {
    members: arrayRemove(userId),
  });
}

/**
 * Per-chat notification mute, stored on the USER doc rather than the chat.
 *
 * `users/{uid}.mutedChats` is a list of chat ids the user has silenced. The
 * onNewCommunityMessage trigger reads it before creating a notification, so a mute
 * suppresses the in-app bell as well as the push. Kept on the user doc because
 * `users/{uid}` update is already permitted for its owner — putting it on the chat
 * would need a new rule and would let every member read everyone else's choice.
 */
export async function muteChat(userId: string, chatId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    mutedChats: arrayUnion(chatId),
  });
}

export async function unmuteChat(userId: string, chatId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    mutedChats: arrayRemove(chatId),
  });
}

export function listenToUserChats(
  userId: string,
  callback: (chats: Chat[]) => void
): Unsubscribe {
  const chatsRef = collection(db, 'chats');

  const q = query(
    chatsRef,
    where('members', 'array-contains', userId)
  );

  console.log('[listenToUserChats] subscribing for userId:', userId);
  return onSnapshot(q, (snapshot) => {
    console.log('[listenToUserChats] snapshot received — size:', snapshot.size, 'empty:', snapshot.empty);
    const chats = snapshot.docs
      .map(docToChat)
      .filter((c) => !(c.hiddenFor ?? []).includes(userId));
    chats.sort((a, b) => {
      const aTime = a.lastMessage?.timestamp?.seconds ?? a.createdAt?.seconds ?? 0;
      const bTime = b.lastMessage?.timestamp?.seconds ?? b.createdAt?.seconds ?? 0;
      return bTime - aTime;
    });
    callback(chats);
  }, (error) => {
    console.log('[listenToUserChats ERROR]', error);
    console.error('[listenToUserChats] snapshot error:');
    console.error('  code:', error.code);
    console.error('  message:', error.message);
    console.error('  customData:', (error as any).customData);
    console.error('  full error:', error);
  });
}

export function listenToMessages(
  chatId: string,
  callback: (messages: Message[]) => void
): Unsubscribe {
  const messagesRef = collection(db, 'chats', chatId, 'messages');

  const q = query(messagesRef, orderBy('timestamp', 'asc'));

  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(docToMessage));
  }, (error) => {
    console.log('[listenToMessages ERROR]', error);
  });
}

export async function sendMessage(
  chatId: string,
  senderId: string,
  text: string,
  opts?: {
    videoUrl?: string; imageURL?: string; audioUrl?: string; audioDuration?: number;
    /** Flat userIds; the create rule checks each against the chat's members. */
    mentions?: string[];
    /** The denormalized quote, from buildReplyTo. Four keys exactly — the
     *  create rule uses hasOnly, so a fifth is denied at the server. */
    replyTo?: Message['replyTo'];
  }
): Promise<void> {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const chatRef = doc(db, 'chats', chatId);

  const messageData: Record<string, unknown> = {
    senderId,
    text,
    timestamp: serverTimestamp(),
    readBy: [senderId],
  };
  // `system` used to be settable here and no caller ever passed it. The create
  // rule now denies the key to clients outright — a faked server notice about
  // payment is the worst thing a forged message could say — so the option is
  // gone rather than left as a footgun that only fails at the server.
  if (opts?.mentions?.length) messageData.mentions = opts.mentions;
  // Conditional, like mentions: the overwhelming majority of messages quote
  // nothing, and an always-present key would be bytes on every one of them.
  if (opts?.replyTo) messageData.replyTo = opts.replyTo;
  if (opts?.videoUrl) messageData.videoUrl = opts.videoUrl;
  if (opts?.imageURL) messageData.imageURL = opts.imageURL;
  if (opts?.audioUrl) messageData.audioUrl = opts.audioUrl;
  if (opts?.audioDuration !== undefined) messageData.audioDuration = opts.audioDuration;

  await addDoc(messagesRef, messageData);

  const chatSnap = await getDoc(chatRef);
  const members: string[] = chatSnap.exists() ? (chatSnap.data().members as string[]) : [];

  const updatePayload: Record<string, unknown> = {
    lastMessage: { text, senderId, timestamp: serverTimestamp() },
  };
  for (const memberId of members) {
    if (memberId !== senderId) {
      updatePayload[`unreadCount.${memberId}`] = increment(1);
    }
  }

  await updateDoc(chatRef, updatePayload);
}

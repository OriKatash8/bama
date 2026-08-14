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
  DocumentData,
  QueryDocumentSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../../core/firebase/config';
import type { Chat, Message } from '../types';

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
  };
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
): Promise<string> {
  const ref = await addDoc(collection(db, 'chats'), {
    type: 'community' as const,
    name,
    description,
    ownerId,
    members: [ownerId],
    lastMessage: null,
    createdAt: serverTimestamp(),
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
    const chats = snapshot.docs.map(docToChat);
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
  opts?: { videoUrl?: string; imageURL?: string; audioUrl?: string; audioDuration?: number }
): Promise<void> {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const chatRef = doc(db, 'chats', chatId);

  const messageData: Record<string, unknown> = {
    senderId,
    text,
    timestamp: serverTimestamp(),
    readBy: [senderId],
  };
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

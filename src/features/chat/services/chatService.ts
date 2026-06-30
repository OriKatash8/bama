import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  arrayUnion,
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
    projectId: data.projectId,
    name: data.name,
    photoURL: data.photoURL,
    roles: data.roles,
    lastMessage: data.lastMessage ?? null,
    createdAt: data.createdAt,
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

export async function addMemberToGroup(chatId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'chats', chatId), {
    members: arrayUnion(userId),
  });
}

export function listenToUserChats(
  userId: string,
  callback: (chats: Chat[]) => void
): Unsubscribe {
  const chatsRef = collection(db, 'chats');

  const q = query(
    chatsRef,
    where('members', 'array-contains', userId),
    orderBy('lastMessage.timestamp', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(docToChat));
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
  text: string
): Promise<void> {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const chatRef = doc(db, 'chats', chatId);

  await addDoc(messagesRef, {
    senderId,
    text,
    timestamp: serverTimestamp(),
    readBy: [senderId],
  });

  await updateDoc(chatRef, {
    lastMessage: {
      text,
      senderId,
      timestamp: serverTimestamp(),
    },
  });
}

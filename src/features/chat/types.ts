import { Timestamp } from 'firebase/firestore';

export type ChatType = 'dm' | 'group';

export interface LastMessage {
  text: string;
  senderId: string;
  timestamp: Timestamp;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  imageURL?: string;
  videoUrl?: string;
  timestamp: Timestamp;
  readBy: string[];
}

export interface Chat {
  id: string;
  type: ChatType;
  members: string[];
  communityId?: string | null;
  projectId?: string;
  name?: string;
  photoURL?: string;
  roles?: Record<string, 'admin' | 'member'>;
  lastMessage?: LastMessage | null;
  createdAt?: Timestamp;
  unreadCount?: Record<string, number>;
}

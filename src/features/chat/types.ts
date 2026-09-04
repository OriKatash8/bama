import { Timestamp } from 'firebase/firestore';

export type ChatType = 'dm' | 'group' | 'community' | 'purchase';

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
  audioUrl?: string;
  audioDuration?: number;
  timestamp: Timestamp;
  readBy: string[];
  /** Server-generated system notice (e.g. new mission/meeting). Rendered as a centered pill. */
  system?: boolean;
  /** Shared marketplace listing — rendered as an actionable card. */
  type?: 'listing';
  listingId?: string;
  listingType?: 'secondhand' | 'rental';
  title?: string;
  price?: number;
  imageUrl?: string | null;
  posterId?: string;
  posterName?: string;
}

export interface Chat {
  id: string;
  type: ChatType;
  members: string[];
  communityId?: string | null;
  ownerId?: string;
  projectId?: string;
  name?: string;
  description?: string;
  photoURL?: string;
  roles?: Record<string, 'admin' | 'member'>;
  lastMessage?: LastMessage | null;
  createdAt?: Timestamp;
  unreadCount?: Record<string, number>;
  category?: string;
  purchaseListingId?: string;
  buyerName?: string;
  sellerAgreed?: boolean;
  buyerAgreed?: boolean;
  archived?: boolean;
  archiveReason?: 'completed' | 'cancelled' | 'superseded';
  hiddenFor?: string[];
  readOnly?: boolean;   // BAMA System DMs — the user cannot reply
  /** Why the chat closed. `'completed'` is written by confirmCompletion, which
   *  makes the chat document a LIVE source of project completion — chats are
   *  already subscribed, so nothing needs to re-read the project. */
  readOnlyReason?: 'completed' | string;
}

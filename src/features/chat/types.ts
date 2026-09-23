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
  /**
   * Members this message mentions, as flat userIds — NOT offsets into `text`.
   *
   * `text` keeps the readable "@Dana Cohen" it was sent with, and the highlight
   * is recovered by scanning for it at render time (see utils/mentions.ts). So
   * the push body and the chat-list preview, which both read `text` verbatim,
   * need no special handling at all.
   *
   * Flat ids rather than {id, name} pairs because the create rule has to check
   * them against the chat's members, and Firestore rules cannot project a field
   * out of each map in a list.
   */
  mentions?: string[];
  /** `@everyone` in a community channel. The community OWNER's alone, enforced
   *  in the rules — it reaches the whole roster AND overrides mute. */
  mentionsEveryone?: boolean;
  /**
   * The message this one replies to, DENORMALIZED — a snapshot, never a live
   * lookup. Written by utils/replyTo.ts and validated for shape and size by
   * replyToOk in firestore.rules.
   *
   * Denormalized because a live lookup would be a read per rendered bubble, and
   * a get() in the rules would be a read per message WRITE. The cost of the
   * snapshot is that it can go stale — it cannot, in practice, since message
   * update and delete are both denied — and that a quoted message may no longer
   * be reachable, which degrades to a quote that does not jump rather than a
   * bubble that fails to render.
   */
  replyTo?: {
    messageId: string;
    senderId: string;
    kind: 'text' | 'image' | 'video' | 'audio';
    snippet: string;
  };
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

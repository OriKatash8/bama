import type { Timestamp } from 'firebase/firestore';

/** A community sub-channel (`chats/{chatId}/channels/{channelId}`). */
export type Channel = {
  id: string;
  name: string;
  createdAt: Timestamp | null;
  createdBy: string;
  lastMessage: { text: string; senderId: string; timestamp: Timestamp } | null;
  /** Stable identity for special channels. Absent = legacy/normal channel. */
  kind?: 'general' | 'market';
};

/** Names the General channel carried before `kind` existed. */
export const GENERAL_CHANNEL_NAMES = ['כללי', 'General'];

/** General and Market can never be deleted (the rules enforce it too). */
export const isGeneralChannel = (ch: Pick<Channel, 'name' | 'kind'>, localizedDefaultName: string) =>
  ch.kind === 'general' || GENERAL_CHANNEL_NAMES.includes(ch.name) || ch.name === localizedDefaultName;

export const isMarketChannel = (ch: Pick<Channel, 'name' | 'kind'>, localizedMarketName: string) =>
  ch.kind === 'market' || ch.name === localizedMarketName;

/** General, then Market, then everything else by creation time. */
export function sortChannels(list: Channel[]): Channel[] {
  const rank = (c: Channel) =>
    c.kind === 'general' || GENERAL_CHANNEL_NAMES.includes(c.name) ? 0 : c.kind === 'market' ? 1 : 2;
  return [...list].sort((a, b) => rank(a) - rank(b) || (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
}

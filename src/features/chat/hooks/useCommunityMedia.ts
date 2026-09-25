import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import type { MediaAsset } from '@core/types/media';
import { mergeChatMedia } from './useChatMedia';

type RawDoc = { id: string; data: Record<string, unknown> };
type ChannelMedia = { images: RawDoc[]; videos: RawDoc[] };

/**
 * Live list of a COMMUNITY's photos and videos, for ChatMediaSection.
 *
 * Community messages are written to `chats/{id}/channels/{cid}/messages`, never
 * to `chats/{id}/messages`, so useChatMedia would find nothing. This listens to
 * the channel list and, per channel, to the same two single-field inequality
 * queries useChatMedia uses — only media messages are read. Ids are prefixed
 * with the channel's, so two channels' messages can never merge into one item.
 *
 * State is keyed by chat and channel rather than reset in the effects: whatever
 * does not belong to the current chat's current channels is simply not read, so
 * a channel that disappears takes its media with it and a new chat id starts
 * empty without a synchronous setState.
 */
export function useCommunityMedia(chatId: string | undefined): MediaAsset[] {
  const [channels, setChannels] = useState<{ chatId: string; ids: string[] } | null>(null);
  const [byChannel, setByChannel] = useState<Record<string, ChannelMedia>>({});

  useEffect(() => {
    if (!chatId) return;
    return onSnapshot(
      collection(db, 'chats', chatId, 'channels'),
      (snap) => setChannels({ chatId, ids: snap.docs.map((d) => d.id) }),
      (err) => console.warn('[useCommunityMedia] channels listener failed (not a member?)', err),
    );
  }, [chatId]);

  const channelIds = useMemo(
    () => (chatId && channels?.chatId === chatId ? channels.ids : []),
    [chatId, channels],
  );

  // Keyed on the id list's contents, so a channel's lastMessage changing does
  // not tear down and rebuild every listener.
  const channelsKey = channelIds.join('|');
  useEffect(() => {
    if (!chatId || channelIds.length === 0) return;
    const toRaw = (cid: string, s: { docs: { id: string; data: () => Record<string, unknown> }[] }) =>
      s.docs.map((d) => ({ id: `${cid}/${d.id}`, data: d.data() }));
    const put = (cid: string, field: keyof ChannelMedia, docs: RawDoc[]) => {
      const key = `${chatId}/${cid}`;
      setByChannel((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { images: [], videos: [] }), [field]: docs } }));
    };
    const onErr = (label: string) => (err: unknown) =>
      console.warn(`[useCommunityMedia] ${label} listener failed`, err);

    const unsubs = channelIds.flatMap((cid) => {
      const messages = collection(db, 'chats', chatId, 'channels', cid, 'messages');
      return [
        onSnapshot(query(messages, where('imageURL', '!=', null)), (s) => put(cid, 'images', toRaw(cid, s)), onErr(`${cid} images`)),
        onSnapshot(query(messages, where('videoUrl', '!=', null)), (s) => put(cid, 'videos', toRaw(cid, s)), onErr(`${cid} videos`)),
      ];
    });
    return () => { unsubs.forEach((u) => u()); };
    // channelsKey stands in for channelIds' contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, channelsKey]);

  return useMemo(() => {
    const live = channelIds.map((cid) => byChannel[`${chatId}/${cid}`]).filter((m): m is ChannelMedia => !!m);
    return mergeChatMedia(live.flatMap((m) => m.images), live.flatMap((m) => m.videos));
  }, [byChannel, channelIds, chatId]);
}

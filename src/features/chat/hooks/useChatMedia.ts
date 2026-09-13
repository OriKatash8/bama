import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import type { MediaAsset } from '@core/types/media';

type RawDoc = { id: string; data: Record<string, unknown> };
type Ts = { seconds: number; nanoseconds: number };

const url = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Every photo (imageURL) and video (videoUrl) message, newest first, shaped for
 * PortfolioViewer. A message still waiting for its server timestamp sorts as
 * newest. A message carrying both fields counts once, as its video.
 */
export function mergeChatMedia(imageDocs: RawDoc[], videoDocs: RawDoc[]): MediaAsset[] {
  const byId = new Map<string, MediaAsset & { sortKey: number }>();
  for (const d of [...imageDocs, ...videoDocs]) {
    const video = url(d.data.videoUrl);
    const image = url(d.data.imageURL);
    if (!video && !image) continue;
    const timestamp = (d.data.timestamp ?? null) as Ts | null;
    byId.set(d.id, {
      id: d.id,
      url: (video ?? image) as string,
      type: video ? 'video' : 'image',
      thumbnailUrl: null,
      uploadedAt: (timestamp ?? { seconds: 0, nanoseconds: 0 }) as MediaAsset['uploadedAt'],
      sortKey: timestamp ? timestamp.seconds + timestamp.nanoseconds / 1e9 : Number.POSITIVE_INFINITY,
    });
  }
  return [...byId.values()]
    .sort((a, b) => b.sortKey - a.sortKey)
    .map(({ sortKey: _sortKey, ...asset }) => asset);
}

/**
 * Live list of a chat's photos and videos. Two queries (`imageURL != null`,
 * `videoUrl != null`) so only media messages are read, not the whole chat. Both are
 * single-field inequalities served by the default indexes. Only chat members can
 * read messages; for anyone else the listeners fail and the list stays empty.
 */
export function useChatMedia(chatId: string | undefined): MediaAsset[] {
  const [images, setImages] = useState<RawDoc[]>([]);
  const [videos, setVideos] = useState<RawDoc[]>([]);

  useEffect(() => {
    setImages([]);
    setVideos([]);
    if (!chatId) return;
    const messages = collection(db, 'chats', chatId, 'messages');
    const toRaw = (snap: { docs: { id: string; data: () => Record<string, unknown> }[] }) =>
      snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    const onErr = (label: string) => (err: unknown) =>
      console.warn(`[useChatMedia] ${label} listener failed (not a member?)`, err);
    const unsubImages = onSnapshot(query(messages, where('imageURL', '!=', null)), (s) => setImages(toRaw(s)), onErr('images'));
    const unsubVideos = onSnapshot(query(messages, where('videoUrl', '!=', null)), (s) => setVideos(toRaw(s)), onErr('videos'));
    return () => { unsubImages(); unsubVideos(); };
  }, [chatId]);

  return useMemo(() => mergeChatMedia(images, videos), [images, videos]);
}

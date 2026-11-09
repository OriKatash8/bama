import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { uploadFile } from '@core/firebase/storage';
import { useVideoUpload, type VideoUploadStage } from '@core/hooks/useVideoUpload';
import { CHAT_VIDEO } from '@core/constants/video';
import { prepareImageForUpload, CHAT_IMAGE } from '@core/media/prepareImageForUpload';
import { useUiStore } from '@core/stores/uiStore';
import { sendMessage } from '../services/chatService';

/** What the bubble shows. Video stages come from useVideoUpload; images have two of their own. */
export type PendingStage = 'preparing' | 'uploading' | VideoUploadStage;

/** One media send, held locally until the real message lands. Captured at Send time. */
export type PendingSend = {
  id: string;
  /** Where it goes. Captured when Send was tapped, never read from the screen's current channel. */
  chatId: string;
  /** '' for chats without channels. */
  channelId: string;
  type: 'image' | 'video';
  uri: string;
  asset: ImagePicker.ImagePickerAsset;
  caption: string;
  failed: boolean;
  /** The uploaded file's URL once known; matches the incoming message so the bubble can vanish with no gap. */
  finalUrl: string | null;
};

type Message = { videoUrl?: string; imageURL?: string };

/** True once the real message (same file URL) is in the list: the bubble is then redundant. */
export function pendingHasLanded(p: PendingSend | null, messages: Message[]): boolean {
  if (!p?.finalUrl) return false;
  return messages.some((m) => (p.type === 'video' ? m.videoUrl : m.imageURL) === p.finalUrl);
}

type Args = {
  chatId: string;
  chatType: string | null;
  activeChannelId: string;
  currentUserId: string | null | undefined;
  t: (key: string) => string;
};

/**
 * One media send at a time, shown as a local bubble at the bottom of the chat while it
 * compresses/uploads. The real message is written only when the file is ready — exactly as
 * before — so push, unread counts and rules are unchanged.
 */
export function useChatMediaSend({ chatId, chatType, activeChannelId, currentUserId, t }: Args) {
  const video = useVideoUpload();
  const showToast = useUiStore((s) => s.showToast);
  const [pending, setPending] = useState<PendingSend | null>(null);
  const [imageStage, setImageStage] = useState<'preparing' | 'uploading'>('preparing');
  const [imageProgress, setImageProgress] = useState(0);
  const runRef = useRef(0);
  const imageControl = useRef<{ cancel?: () => void }>({});
  const pendingRef = useRef<PendingSend | null>(null);
  pendingRef.current = pending;

  useEffect(() => () => {
    runRef.current += 1; // unmounted: no state writes from the run in flight
    imageControl.current.cancel?.();
  }, []);

  /** A send that has not failed and is not done. */
  const inFlight = pending !== null && !pending.failed;

  /** Call before opening a picker: false (and a toast) when a send is already going. */
  function canStartNew(): boolean {
    if (!pendingRef.current || pendingRef.current.failed) return true;
    showToast(t('chats.media_send_in_progress'), 'info');
    return false;
  }

  async function run(item: PendingSend) {
    if (!currentUserId) return;
    const mine = ++runRef.current;
    const live = () => runRef.current === mine;
    setPending({ ...item, failed: false, finalUrl: null });
    setImageStage('preparing');
    setImageProgress(0);
    try {
      let url: string | null = null;
      if (item.type === 'video') {
        url = await video.uploadVideo('chat-videos', currentUserId, item.asset, CHAT_VIDEO);
        if (!live()) return;
        if (!url) {
          if (video.getOutcome() === 'failed') setPending((p) => (p ? { ...p, failed: true } : p));
          else setPending(null);
          return;
        }
      } else {
        const prepared = await prepareImageForUpload(item.asset.uri, CHAT_IMAGE);
        if (!live()) return;
        const blob = await fetch(prepared).then((r) => r.blob());
        if (!live()) return;
        setImageStage('uploading');
        imageControl.current = {};
        url = await uploadFile(
          `chat-images/${item.chatId}/${Date.now()}.jpg`,
          blob,
          (p) => { if (live()) setImageProgress(Math.min(1, p.percentage / 100)); },
          undefined,
          imageControl.current,
        );
        if (!live()) return;
      }
      setPending((p) => (p ? { ...p, finalUrl: url } : p));
      const field = item.type === 'video' ? { videoUrl: url } : { imageURL: url };
      if (chatType === 'community' && item.channelId) {
        await addDoc(collection(db, 'chats', item.chatId, 'channels', item.channelId, 'messages'), {
          senderId: currentUserId, text: item.caption, timestamp: serverTimestamp(), readBy: [currentUserId], ...field,
        });
      } else {
        await sendMessage(item.chatId, currentUserId, item.caption, field);
      }
      // The bubble normally disappears as soon as the message shows up (pendingHasLanded);
      // this covers a list that never carries it, e.g. a blocked sender.
      if (live()) setPending(null);
    } catch {
      if (!live()) return; // cancelled
      setPending((p) => (p ? { ...p, failed: true } : p));
    }
  }

  /** Send tapped in the preview: capture the destination now and start. */
  function start(asset: ImagePicker.ImagePickerAsset, type: 'image' | 'video', caption: string) {
    void run({
      id: `pending-${Date.now()}`,
      chatId,
      channelId: chatType === 'community' ? activeChannelId : '',
      type,
      uri: asset.uri,
      asset,
      caption,
      failed: false,
      finalUrl: null,
    });
  }

  function cancel() {
    runRef.current += 1;
    video.cancel();
    imageControl.current.cancel?.();
    setPending(null);
  }

  function retry() {
    if (pendingRef.current?.failed) void run(pendingRef.current);
  }

  const stage: PendingStage = pending?.type === 'video' ? (video.stage === 'idle' ? 'preparing' : video.stage) : imageStage;
  const progress = pending?.type === 'video' ? video.progress : imageProgress;

  return { pending, inFlight, stage, progress, canStartNew, start, cancel, retry, dismiss: () => setPending(null) };
}

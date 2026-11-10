import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { createReadMarker } from '../utils/readMarker';
import { toMillis, type ReadMap } from '../utils/readReceipts';

type Args = {
  chatId: string;
  /** isReceiptChat(type) AND the viewer is in the chat's members. False: no listener, no writes. */
  enabled: boolean;
  currentUserId: string;
  /** Changes when a new message lands, so we mark it read while the chat is open. */
  latestMessageKey: string | null;
};

/**
 * Read receipts for one project / marketplace chat.
 *
 * Reading: ONE listener on `chats/{chatId}/readState`, folded into uid → ms. Each
 * member's doc is a watermark ("had the chat open at this moment"), not a per-message
 * flag, so a message is seen by X when X's watermark >= the message's timestamp.
 *
 * Writing: my own watermark, only while the screen is focused AND the app is in the
 * foreground, throttled (see createReadMarker). Blur and background cancel any
 * pending write, so nothing is ever recorded after the user has left.
 */
const NO_READS: ReadMap = {};

export function useReadReceipts({ chatId, enabled, currentUserId, latestMessageKey }: Args): ReadMap {
  // Tagged with its chat so a stale map is never shown after switching chats.
  const [reads, setReads] = useState<{ chatId: string; map: ReadMap }>({ chatId: '', map: NO_READS });
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);

  // One listener for the whole chat — never per message. None when disabled.
  useEffect(() => {
    if (!enabled || !chatId) return;
    return onSnapshot(
      collection(db, 'chats', chatId, 'readState'),
      (snap) => {
        const next: ReadMap = {};
        snap.docs.forEach((d) => {
          // A just-written serverTimestamp is null locally until the server stamps it.
          const ms = toMillis(d.data().lastReadAt);
          if (ms !== null) next[d.id] = ms;
        });
        setReads({ chatId, map: next });
      },
      (error) => console.log('[readReceipts] listener error:', error),
    );
  }, [chatId, enabled]);

  const marker = useMemo(
    () => (enabled && chatId && currentUserId
      ? createReadMarker(() => {
          setDoc(doc(db, 'chats', chatId, 'readState', currentUserId), { lastReadAt: serverTimestamp() })
            .catch((error) => console.log('[readReceipts] mark-read failed:', error));
        })
      : null),
    [enabled, chatId, currentUserId],
  );

  const active = enabled && focused && foreground;

  // Mark read on open / return, and whenever a new message lands while we're here.
  useEffect(() => {
    if (!marker || !active) return;
    marker.request();
  }, [marker, active, latestMessageKey]);

  // Leaving (blur, background, disabled, unmount) drops any pending trailing write.
  useEffect(() => {
    if (!marker || active) return;
    marker.cancel();
  }, [marker, active]);
  useEffect(() => () => marker?.cancel(), [marker]);

  return enabled && reads.chatId === chatId ? reads.map : NO_READS;
}

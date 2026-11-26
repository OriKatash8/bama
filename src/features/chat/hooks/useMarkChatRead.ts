import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { shouldMarkRead, unreadFieldPath } from '../utils/markRead';

type Args = {
  chatId: string;
  userId: string | undefined;
  chatType: string | null;
  /** The open channel, for a community. */
  channelId: string | null;
  /** The live count for what is on screen (chat, or the open channel). */
  unread: number;
  /** The count at open has been captured; see MarkReadState.ready. */
  ready: boolean;
};

/** Short, so a burst of messages is one write, and the tab badge never lingers. */
const DEBOUNCE_MS = 250;

/**
 * Keeps this chat's unread at 0 for as long as it is on screen: on open, on every
 * message that arrives while it is open (the server's +1 shows up in the live
 * count, and this resets it), and once more on blur / unmount for anything still
 * pending. Only writes the reader's OWN entry — the rules allow nothing else.
 *
 * Reads no document and writes only when the live count is above 0, so it cannot
 * loop against its own snapshot and costs nothing in a quiet chat.
 */
export function useMarkChatRead({ chatId, userId, chatType, channelId, unread, ready }: Args): void {
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

  const path = userId ? unreadFieldPath(chatType, userId, channelId) : null;

  // Latest values for the unmount flush, which must not re-run on every change.
  const latest = useRef({ chatId, path, unread });
  useEffect(() => { latest.current = { chatId, path, unread }; });

  useEffect(() => {
    if (!path || !shouldMarkRead({ ready, focused, foreground, unread })) return;
    const timer = setTimeout(() => {
      updateDoc(doc(db, 'chats', chatId), { [path]: 0 }).catch((e) => {
        // Not swallowed any more: a denied or failed reset is why a badge sticks.
        if (__DEV__) console.warn('[useMarkChatRead] reset failed', path, e);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [chatId, path, ready, focused, foreground, unread]);

  // Leaving the screen (blur or unmount) with something still counted: clear it.
  // Whatever arrived inside the debounce window would otherwise stay on the badge.
  const wasFocused = useRef(false);
  useEffect(() => {
    if (focused) { wasFocused.current = true; return; }
    if (!wasFocused.current) return;
    wasFocused.current = false;
    flush(latest.current);
  }, [focused]);
  useEffect(() => () => flush(latest.current), []);
}

function flush({ chatId, path, unread }: { chatId: string; path: string | null; unread: number }): void {
  if (!path || unread <= 0) return;
  updateDoc(doc(db, 'chats', chatId), { [path]: 0 }).catch((e) => {
    if (__DEV__) console.warn('[useMarkChatRead] flush failed', path, e);
  });
}

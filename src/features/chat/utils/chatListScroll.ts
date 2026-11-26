/**
 * Scroll maths for the chat message list, shared by every platform.
 *
 * The list is NEWEST-FIRST and shows the newest message at the bottom. Its offset is the distance
 * from the newest message: 0 = at the bottom. That is what React Native's `inverted` FlatList
 * reports natively, and what ColumnReverseScrollView reports on web, so everything below means
 * the same thing on both.
 */

/** Within this of the newest message counts as "at the bottom": new messages keep the view pinned. */
export const NEAR_NEWEST_PX = 80;
/** Further than this from the newest message, the jump-to-latest button appears. */
export const SHOW_JUMP_PX = 200;

export function isNearNewest(offset: number): boolean {
  return offset <= NEAR_NEWEST_PX;
}

/**
 * The browser's scrollTop in a `column-reverse` scroller is 0 at the bottom and NEGATIVE going up
 * (older). The list's offset is the opposite sign. `|| 0` keeps -0 out of it.
 */
export function toListOffset(scrollTop: number): number {
  return -scrollTop || 0;
}
export function toScrollTop(listOffset: number): number {
  return -listOffset || 0;
}

type Msg = { id: string; senderId: string };

export type Arrivals = {
  /** No usable baseline (first snapshot, a channel switch, or the last-seen message is gone): note it, change nothing. */
  reset: boolean;
  /** Messages from other people since the last snapshot. */
  fromOthers: number;
  /** I sent at least one of the new messages. */
  mine: boolean;
  /** The newest visible message now: the baseline for the next snapshot. */
  newestId: string | null;
};

/**
 * What a snapshot added at the newest end, relative to the newest message the previous snapshot
 * ended on. `messages` is oldest-first, as the listeners deliver it. Hidden (blocked) senders are
 * left out, since the reader never sees them.
 */
export function arrivalsSince(
  messages: Msg[],
  lastSeenId: string | null,
  myId: string,
  isHidden: (m: Msg) => boolean,
): Arrivals {
  const visible = messages.filter((m) => !isHidden(m));
  const newestId = visible.length ? visible[visible.length - 1].id : null;
  if (lastSeenId === null) return { reset: true, fromOthers: 0, mine: false, newestId };
  const at = visible.findIndex((m) => m.id === lastSeenId);
  if (at < 0) return { reset: true, fromOthers: 0, mine: false, newestId };
  const added = visible.slice(at + 1);
  return {
    reset: false,
    fromOthers: added.filter((m) => m.senderId !== myId).length,
    mine: added.some((m) => m.senderId === myId),
    newestId,
  };
}

/** DOM id of a message row on web, for jumping to it with scrollIntoView. */
export function webRowId(itemId: string): string {
  return `chat-row-${itemId}`;
}

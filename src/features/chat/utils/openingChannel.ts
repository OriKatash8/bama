/**
 * The channel a community opens on: the one it would open on anyway (General)
 * when that has unread messages or nothing does; otherwise the first channel,
 * in strip order, with something unread — so the reader lands on what is new
 * instead of a channel where nothing happened.
 *
 * `counts` is the reader's `channelUnread` entry as it was when they opened the
 * community (read BEFORE it is cleared). Counts for deleted channels are ignored.
 */
export function openingChannelId(
  stripOrder: string[],
  current: string,
  counts: Record<string, number>,
): string {
  if ((counts[current] ?? 0) > 0) return current;
  return stripOrder.find((id) => (counts[id] ?? 0) > 0) ?? current;
}

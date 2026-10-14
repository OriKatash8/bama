import type { Message } from '@features/chat/types';

/**
 * Whether a chat message must be hidden from someone who blocked its sender.
 *
 * Only a PERSON's content goes. System pills, the project's closing card and
 * BAMA System notices keep rendering — they are the app speaking, and in a
 * project chat they carry the fee, completion and contact information both
 * sides still need. The blocked user also stays a member of the chat, so a
 * project keeps working; they simply stop appearing to the blocker.
 */
export function isHiddenByBlock(
  msg: Pick<Message, 'senderId' | 'system' | 'kind'>,
  blocked: readonly string[],
): boolean {
  if (blocked.length === 0) return false;
  if (msg.system || msg.kind === 'project_closed') return false;
  if (msg.senderId === 'system') return false;
  return blocked.includes(msg.senderId);
}

/** The blocked senders that actually have a message in this list (for the banner). */
export function hiddenSenders(
  messages: readonly Pick<Message, 'senderId' | 'system' | 'kind'>[],
  blocked: readonly string[],
): string[] {
  const out = new Set<string>();
  for (const m of messages) if (isHiddenByBlock(m, blocked)) out.add(m.senderId);
  return [...out];
}

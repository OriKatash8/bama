import type { Message } from '../types';

/**
 * What a reply stores about the message it quotes.
 *
 * DENORMALIZED on purpose: the referenced message is never read back, so this
 * snapshot is the whole of what a reader sees. That is what keeps a reply to a
 * thousand-message history at one write and zero reads, and it is why a
 * deleted or unreachable original degrades to a quote that simply does not
 * jump, rather than a bubble that fails to render.
 *
 * Four keys exactly, all required. The create rule uses `hasOnly` and then
 * reads each one, so a fifth key is denied outright and a missing one dies on
 * the accessor — see replyToOk in firestore.rules.
 */
export type ReplyTo = {
  messageId: string;
  senderId: string;
  kind: 'text' | 'image' | 'video' | 'audio';
  snippet: string;
};

/**
 * How much of the original the quote carries.
 *
 * The rules enforce the same number, and they count CHARACTERS rather than
 * UTF-8 bytes — confirmed against the emulator with 100 Hebrew characters — so
 * a Hebrew quote gets the same allowance as a Latin one instead of being cut to
 * a third of the length. Matching the cap here rather than only at the server
 * is what turns "that message was long" into a trimmed quote instead of a send
 * that fails with a permission error.
 */
export const SNIPPET_MAX = 100;

/**
 * The quote for a message, or null if that message cannot be replied to.
 *
 * This is the single not-repliable guard. System notices are excluded because a
 * reply to "the crew is set" has no one to address — they are written by the
 * Cloud Functions and belong to no member — and the shared listing card is
 * excluded because it is an actionable card, not something anyone said. The
 * caller does not offer the gesture where this returns null.
 */
export function buildReplyTo(msg: Message): ReplyTo | null {
  // Both halves of how renderItem recognises a system notice. Checking only the
  // boolean would leave the senderId form repliable, and those are exactly the
  // purchase-chat and "X left the project" notices.
  if (msg.system || msg.senderId === 'system') return null;
  if (msg.type === 'listing') return null;

  // Same order renderItem branches in, so the quote's label always agrees with
  // the bubble it points at.
  const kind: ReplyTo['kind'] = msg.videoUrl ? 'video'
    : msg.imageURL ? 'image'
      : msg.audioUrl ? 'audio'
        : 'text';

  return { messageId: msg.id, senderId: msg.senderId, kind, snippet: snippetOf(msg.text) };
}

/**
 * One line, bounded.
 *
 * Newlines collapse because the quote renders in a two-line block above the
 * reply: a message that opened with three blank lines would otherwise push its
 * own text out of view. Nothing invisible is ever added — FSI/PDI isolation is
 * applied at render, because this string is stored and would flow verbatim into
 * the push body and the chat-list preview.
 */
function snippetOf(text: string | undefined): string {
  const oneLine = (text ?? '').replace(/\s+/g, ' ').trim();
  return oneLine.length <= SNIPPET_MAX ? oneLine : oneLine.slice(0, SNIPPET_MAX);
}

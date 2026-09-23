/**
 * Who gets notified about a new message, and as what.
 *
 * Pure, and deliberately separate from the two triggers that call it
 * (`onNewChatMessage`, `onNewCommunityMessage`). The rule it encodes is the
 * whole reason @ exists — **a mention reaches you even when you have muted the
 * chat** — and that is worth being able to test without an emulator.
 *
 * Mute today is `users/{uid}.mutedChats` and is only consulted by the community
 * trigger, so `mutedBy` is empty for group chats. Passing it uniformly means
 * the rule does not have to change when mute is extended to groups.
 */

export type NotifyKind = 'message' | 'mention';
export type Recipient = { userId: string; kind: NotifyKind };

export function recipientsFor(args: {
  /** The parent chat's `members` — the audience for a channel too, since
   *  channels carry no membership of their own. */
  members: readonly string[];
  senderId: string;
  /** userIds from the message document. Already validated against membership by
   *  the create rule; re-filtered here because this decides who gets pushed and
   *  a document written before that rule shipped could carry a stranger. */
  mentions?: readonly string[];
  /** Owner-only, community channels only. Expands to the whole roster. */
  mentionsEveryone?: boolean;
  /** userIds who have silenced this chat. */
  mutedBy: readonly string[];
}): Recipient[] {
  const { members, senderId, mentions = [], mentionsEveryone = false, mutedBy } = args;

  // The audience is the whole roster minus the sender, and every decision below
  // is made against it. That one filter is why nothing here re-checks whether a
  // mentioned id is the sender or even a member: neither can match an entry in
  // `audience`, so a guard for either would be unreachable — mutation testing
  // confirmed both could be deleted without failing a single case.
  const audience = members.filter((uid) => uid !== senderId);
  const muted = new Set(mutedBy);
  const mentioned = new Set(mentionsEveryone ? audience : mentions);

  return audience.flatMap<Recipient>((userId) => {
    if (mentioned.has(userId)) return [{ userId, kind: 'mention' as const }];
    if (muted.has(userId)) return [];
    return [{ userId, kind: 'message' as const }];
  });
}

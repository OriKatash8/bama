import { chatGroupOf } from '@features/chat/utils/chatGroup';
import type { ActiveMode } from '@core/types/user';

export type InviteExitTarget =
  | { to: 'community'; chatId: string }
  | { to: 'chats' }
  | { to: 'home' };

/**
 * EVERY navigation out of the invite screen goes through here.
 *
 * Always an explicit route group, never a bare `/chat/...`: both (client) and
 * (professional) have a `chat/` folder, groups are not part of a URL, and the
 * invite screen sits outside both, so a bare path is ambiguous. The group is the
 * viewer's ACTIVE mode, as useNotificationRouting does. (useAdoptGroupMode does
 * not switch modes, so a link opened while in professional mode must stay there.)
 * Same default as the chat room: anything that isn't 'client' is professional.
 */
export function inviteExitHref(activeMode: ActiveMode | null | undefined, target: InviteExitTarget): string {
  const group = chatGroupOf(activeMode);
  switch (target.to) {
    case 'community':
      return `/${group}/chat/${encodeURIComponent(target.chatId)}`;
    case 'chats':
      return `/${group}/(tabs)/chats`;
    case 'home':
      return group === '(client)' ? '/(client)/(tabs)/home' : '/(professional)/(tabs)/dashboard';
  }
}

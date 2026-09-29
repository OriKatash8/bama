/**
 * The chat room project details' back arrow must replace itself with, or null
 * to pop as it always has.
 *
 * A pop is right only when the screen underneath, in this chat stack, is the
 * project's own chat room. A notification (end date soon, removal, a finished
 * engagement) or the dashboard's slot sheet opens project details straight
 * from a tab, and a pop there landed on that tab — the home page — instead of
 * the chat. With no chat id there is no chat to return to.
 */
type StackState = {
  index?: number;
  routes: { name: string; params?: object }[];
} | undefined;

export function projectDetailsBack(
  state: StackState,
  chatId: string | undefined,
  chatGroup: '(client)' | '(professional)',
): string | null {
  if (!chatId) return null;
  const below = state && state.index != null ? state.routes[state.index - 1] : undefined;
  const belowChatId = (below?.params as { chatId?: string } | undefined)?.chatId;
  return below?.name === '[chatId]' && belowChatId === chatId ? null : `/${chatGroup}/chat/${chatId}`;
}

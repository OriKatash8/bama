import type { ActiveMode } from '@core/types/user';

/**
 * The route group — and so the navigation STACK — the viewer's chat screens
 * live in. The app root is a Slot over two separate stacks, (client) and
 * (professional); a screen pushed into the other one has nothing of this one
 * underneath it, so back and the edge-swipe cannot return to where you were.
 * Same default as the chat room's own back arrow: anything not 'client' is pro.
 */
export function chatGroupOf(activeMode: ActiveMode | null | undefined): '(client)' | '(professional)' {
  return activeMode === 'client' ? '(client)' : '(professional)';
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SWIPE BACK ONLY FROM THE SCREEN EDGE — A SWIPE ON A MESSAGE REPLIES.
 *
 * The room is the FIRST screen of its chat stack, so that stack has nothing to
 * pop: a back swipe goes to the OUTER (client)/(professional) stack and pops the
 * whole chat. Its `chat` route had no gesture options, and on iOS 26 an unset
 * fullScreenGestureEnabled means the swipe spans the whole screen — so swiping a
 * message to reply took you back to the chat list. The edge-only options must
 * reach that outer route, not just the room's own screen.
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('one set of edge-only gesture options', () => {
  expect(SRC).toMatch(/const EDGE_BACK_SWIPE = \{ fullScreenGestureEnabled: false, gestureResponseDistance: \{ start: 24 \} \} as const;/);
});

it('on the room\'s own screen', () => {
  expect(SRC).toMatch(/<Stack\.Screen options=\{\{ headerShown: false, gestureEnabled: !cardSwipeable, \.\.\.EDGE_BACK_SWIPE \}\} \/>/);
});

it('and on the outer route the swipe actually reaches — the candidate card still switches it off', () => {
  expect(SRC).toMatch(/navigation\.getParent\(\)\?\.setOptions\(\{ gestureEnabled: !cardSwipeable, \.\.\.EDGE_BACK_SWIPE \}\);/);
  expect(SRC).toMatch(/useLayoutEffect\(\(\) => \{\s*navigation\.getParent\(\)/);
});

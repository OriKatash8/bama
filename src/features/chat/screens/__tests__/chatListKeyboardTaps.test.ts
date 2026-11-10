import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The chat message list must not capture touches while the keyboard is open, or a
 * row's swipe-to-reply never receives the gesture (the list defaults to
 * keyboardShouldPersistTaps="never", which claims every touch that is not a text
 * input so a tap can dismiss the keyboard). Real touch handling can't be rendered in
 * jest, so this pins the props on the list itself.
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

// The message list is the FlatList that carries the pinned-scroll handlers.
const start = SRC.indexOf('<FlatList\n          ref={flatListRef}');
const LIST = SRC.slice(start, SRC.indexOf('ListFooterComponent={pendingBubble}', start) + 60);

it('finds the message list', () => {
  expect(start).toBeGreaterThan(-1);
});

it('lets a child claim the touch while the keyboard is open', () => {
  expect(LIST).toMatch(/keyboardShouldPersistTaps="handled"/);
});

it('drags the list down to close the keyboard: interactive on iOS, on-drag on Android', () => {
  expect(LIST).toMatch(/keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
});

it('leaves the row\'s PanResponder alone (the fix is on the list, not the gesture)', () => {
  const row = readFileSync(join(__dirname, '..', '..', 'components', 'SwipeableMessageRow.tsx'), 'utf8');
  expect(row).toMatch(/PanResponder/);
  expect(row).not.toMatch(/keyboardShouldPersistTaps|keyboardDismissMode|Keyboard\./);
});

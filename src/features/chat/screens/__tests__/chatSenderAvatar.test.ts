import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SOMEONE ELSE'S MESSAGE WEARS THEIR PICTURE, ON THE OUTER EDGE.
 * Their bubbles sit on the reading side — the left in English, the right in
 * Hebrew — so the picture goes before the bubble in English and after it in
 * Hebrew (the layout is LTR-locked app-wide; see bubbleSide). Your own messages
 * have none.
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');
const row = SRC.slice(SRC.indexOf('<SwipeableMessageRow'), SRC.indexOf('</SwipeableMessageRow>'));

it('before the bubble in English, after it in Hebrew — never on your own', () => {
  const before = row.indexOf('{!isOwn && !rtl && senderAvatar(msg.senderId)}');
  const bubble = row.indexOf('{msg.videoUrl ? (');
  const after = row.indexOf('{!isOwn && rtl && senderAvatar(msg.senderId)}');
  expect(before).toBeGreaterThan(-1);
  expect(bubble).toBeGreaterThan(before);
  expect(after).toBeGreaterThan(bubble);
});

it('the picture comes from the same user read as the name', () => {
  const effect = SRC.slice(SRC.indexOf('// Sender display names'), SRC.indexOf('async function handleChangeChatPhoto'));
  expect(effect).toMatch(/setUserPhotos\(/);
  expect(effect.match(/getDoc\(doc\(db, 'users', id\)\)/g)).toHaveLength(1);
});

it('taps through to the profile exactly where the name does — in every chat type, project chats included', () => {
  const helper = SRC.slice(SRC.indexOf('const senderAvatar = useCallback'), SRC.indexOf('const senderAvatar = useCallback') + 700);
  // Project chats used to be the exception (commit 67e93e43); the profile now hides Block
  // there instead (?from=projectChat), see chatProfileTap.test.ts.
  expect(helper).toMatch(/onPress=\{\(\) => pushProfile\(senderId\)\}/);
  expect(helper).not.toMatch(/chatType === 'group'/);
});

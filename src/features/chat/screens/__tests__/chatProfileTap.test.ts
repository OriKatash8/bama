import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tapping a sender's avatar or name opens their read-only profile in every chat type,
 * project chats included. From a PROJECT chat the profile hides Block (the chat passes
 * ?from=projectChat). Real taps can't be rendered in jest, so this pins the wiring.
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('the avatar opens the profile in every chat type — no project-chat exception', () => {
  expect(SRC).toMatch(/onPress=\{\(\) => pushProfile\(senderId\)\}\n\s+\/>\n\s+\), \[pushProfile, userNames, userPhotos\]\)/);
  expect(SRC).not.toMatch(/onPress=\{chatType === 'group' \? undefined/);
});

it('the sender name opens it too — it is no longer plain text in project chats', () => {
  const start = SRC.indexOf('const senderLabel = useCallback(');
  const body = SRC.slice(start, SRC.indexOf('[chatType, pushProfile, t, userNames]', start));
  expect(body).not.toMatch(/if \(chatType === 'group'\) return label;/);
  expect(body).toMatch(/onPress=\{\(\) => pushProfile\(senderId\)\}/);
});

it('the route carries where it was opened from: projectChat for a project chat, chat otherwise', () => {
  expect(SRC).toMatch(/const from = chatType === 'group' \? 'projectChat' : 'chat';/);
  expect(SRC).toMatch(/browse\/profile\/\$\{uid\}\?from=\$\{from\}/);
  expect(SRC).toMatch(/\}, \[activeMode, chatType, currentUserId, router\]\);/);
});

it('my own avatar: there is none (avatars sit beside other people\'s bubbles only) and pushProfile ignores my uid and the system account', () => {
  expect(SRC.match(/\{!isOwn && !rtl && senderAvatar\(msg\.senderId\)\}/g)).toHaveLength(1);
  expect(SRC.match(/\{!isOwn && rtl && senderAvatar\(msg\.senderId\)\}/g)).toHaveLength(1);
  expect(SRC).toMatch(/uid === currentUserId \|\| uid === SYSTEM_USER_ID \|\| uid === 'system'\) return;/);
});

it('the rule is written down where the next reader will look', () => {
  expect(SRC).toMatch(/profile hides Block and\s+\/\/ keeps Report \(pushProfile passes \?from=projectChat\)/);
});

it('leaves the receipts, Phase A and keyboard work alone', () => {
  expect(SRC).toMatch(/const receiptsOn = isReceiptChat\(chatType\)/);
  expect(SRC).toMatch(/keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
  expect(SRC).toMatch(/<KeyboardSafeView style=\{styles\.flex\}>/);
});

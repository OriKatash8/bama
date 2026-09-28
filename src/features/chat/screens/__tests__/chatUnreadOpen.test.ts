import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * OPENING A CHAT WITH NEW MESSAGES.
 * It opens on the first message the reader has not seen, under a "N new
 * messages" divider like WhatsApp's. The unread count has to be READ before
 * it is cleared, or it is always 0 by the time the list looks at it.
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('reads the unread count before clearing it', () => {
  const effect = SRC.slice(SRC.indexOf('// Clear unread count'), SRC.indexOf('// Non-community messages listener'));
  const read = effect.indexOf("getDoc(doc(db, 'chats', chatId))");
  const clear = effect.indexOf('[`unreadCount.${currentUserId}`]: 0');
  expect(read).toBeGreaterThan(-1);
  expect(clear).toBeGreaterThan(read);
  // Communities count across channels, so no single channel can be placed.
  expect(effect).toMatch(/type !== 'community'/);
});

it('places the divider right above the first unread message', () => {
  // Placed by whichever lands second: the unread read, or the messages.
  expect(SRC).toMatch(/firstUnreadMessageId\(messagesRef\.current, currentUserId, count\)/);
  expect(SRC).toMatch(/firstUnreadMessageId\(msgs, currentUserId, prev\.count\)/);
  expect(SRC).toMatch(/type: 'unread-separator'/);
  expect(SRC).toMatch(/item\.type === 'unread-separator'/);
});

it('opens on the divider through the sticky pin, unless a mention jump already won', () => {
  const pin = SRC.slice(SRC.indexOf('// Open on the first unread message'), SRC.indexOf('// Back from community search'));
  expect(pin).toMatch(/pinTargetRef\.current = \{ kind: 'message', id: UNREAD_BANNER_ID \}/);
  expect(pin).toMatch(/jumpedRef\.current\.startsWith/);
});

it('the divider goes once the reader answers', () => {
  const send = SRC.slice(SRC.indexOf('async function handleSend()'), SRC.indexOf('async function handleSendPendingMedia'));
  expect(send).toMatch(/setUnreadBanner\(null\)/);
});

it('says how many, in both languages', () => {
  expect(en.chats.unread_banner_one).toBe('1 new message');
  expect(en.chats.unread_banner).toBe('{{count}} new messages');
  expect(he.chats.unread_banner_one).toBe('הודעה חדשה אחת');
  expect(he.chats.unread_banner).toBe('{{count}} הודעות חדשות');
});

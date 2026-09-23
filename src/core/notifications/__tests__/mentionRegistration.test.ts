import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * A new notification type has to be registered in FIVE places, and missing any
 * one of them fails silently.
 *
 * useNotificationRouting's own doc comment says it: "Each of these needs a case
 * HERE as well as a writer and a prefs entry. Missing this switch is the
 * failure that looks like success." The push arrives, the user taps it, and
 * nothing happens — no error anywhere.
 *
 * Source-text assertions because four of the five are arrays and switch cases
 * that cannot be imported without dragging in expo-notifications and the
 * firebase admin SDK. Thin, but they fail loudly when someone adds the sixth
 * type and registers it in four places.
 */

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const ROUTING = read('src', 'core', 'notifications', 'useNotificationRouting.ts');
const ACTIVE_CHAT = read('src', 'core', 'stores', 'activeChatStore.ts');
const SETTINGS = read('src', 'app', 'settings', 'notifications.tsx');
const SERVER_PREFS = read('functions', 'src', 'notifications', 'index.ts');
const TRIGGERS = read('functions', 'src', 'notifications', 'triggers.ts');

it('1. the server writes type:"mention" — via the shared fan-out, not by hand', () => {
  expect(TRIGGERS).toMatch(/fanOutMessage\(/);
  expect(TRIGGERS).toMatch(/mentionBody:/);
  // Both triggers, not just the community one.
  expect(TRIGGERS.match(/fanOutMessage\(/g)).toHaveLength(2);
});

it('2. notifPrefs cannot silence it — "mention" is ESSENTIAL', () => {
  const list = SERVER_PREFS.slice(SERVER_PREFS.indexOf('const ESSENTIAL'), SERVER_PREFS.indexOf('];'));
  expect(list).toContain("'mention'");
});

it('3. the routing switch has a case, or the tap does nothing at all', () => {
  const sw = ROUTING.slice(ROUTING.indexOf('switch (data.type)'));
  expect(sw).toMatch(/case 'mention':/);
  // It must land in the chat branch — a case that falls to `default` returns
  // silently, which is exactly the failure that looks like success.
  const mentionAt = sw.indexOf("case 'mention':");
  const chatNav = sw.indexOf('/chat/${data.chatId}');
  const defaultAt = sw.indexOf('default:');
  expect(mentionAt).toBeLessThan(chatNav);
  expect(chatNav).toBeLessThan(defaultAt);
});

it('4. foreground suppression recognises it', () => {
  // Without this a mention buzzes while you are reading the very channel it
  // was posted in.
  expect(ACTIVE_CHAT).toMatch(/type !== 'message' && type !== 'mention'/);
});

it('5. the settings screen lists it as essential, not optional', () => {
  expect(SETTINGS).toMatch(/ESSENTIAL_TYPES = \[[^\]]*'mention'/);
  expect(SETTINGS).not.toMatch(/OPTIONAL_TYPES = \[[^\]]*'mention'/);
});

it('and it has a label in both languages', () => {
  // An unlabelled row renders the raw key, which is how a half-registered type
  // reaches production looking almost right.
  expect(typeof (en.settings as Record<string, unknown>).notif_type_mention).toBe('string');
  expect(typeof (he.settings as Record<string, unknown>).notif_type_mention).toBe('string');
  expect((he.settings as Record<string, string>).notif_type_mention).toMatch(/[֐-׿]/);
});

it('the mute override lives in the trigger, before any notification exists', () => {
  // ESSENTIAL only bypasses notifPrefs. Mute is enforced earlier, in the
  // trigger, so a mention has to skip it THERE or it is dropped before
  // onNotificationCreate ever sees it.
  expect(TRIGGERS).toMatch(/needMuteCheck\(/);
  const community = TRIGGERS.slice(TRIGGERS.indexOf('onNewCommunityMessage'));
  expect(community.indexOf('needMuteCheck(')).toBeLessThan(community.indexOf('fanOutMessage('));
});

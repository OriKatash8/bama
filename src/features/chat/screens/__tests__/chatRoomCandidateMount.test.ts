import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EDGE_PX } from '../../utils/swipeGeometry';

/**
 * Where the review card and chip mount in ChatRoomScreen, and who gets which.
 * The screen is too heavy to render in a unit test; the components are tested
 * on their own. This pins the wiring.
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('mounts above the message list, so it stays pinned while messages scroll', () => {
  const mount = SRC.indexOf('<CandidateReviewCard');
  const list = SRC.indexOf('<View style={{ flex: 1, zIndex: 0 }}>');
  expect(mount).toBeGreaterThan(-1);
  expect(mount).toBeLessThan(list);
  expect(SRC.indexOf('<CandidateProCard')).toBeLessThan(list);
});

it('client gets the card, anyone else on the project gets the chip — by project role, not mode', () => {
  expect(SRC).toMatch(/projectClientId === currentUserId\s*\?\s*\(?\s*<CandidateReviewCard[\s\S]{0,240}?clientId=\{currentUserId\}/);
  expect(SRC).toMatch(/:\s*<CandidateProCard[^>]*proId=\{currentUserId\}/);
  expect(SRC).not.toMatch(/CandidateStatusChip/);
});

it('only on open project group chats', () => {
  expect(SRC).toMatch(/chatType === 'group' && !!chatProjectId && !!projectClientId && !isReadOnly && !chatArchived && \(/);
});

it('follows the project live, so the chip leaves when the project activates', () => {
  expect(SRC).toMatch(/return onSnapshot\(\s*doc\(db, 'projects', chatProjectId\)/);
  expect(SRC).toMatch(/setProjectStatus\(data\?\.status\)/);
});

it('renders the crew message as its own pill', () => {
  expect(SRC).toMatch(/text\.startsWith\('🎬'\)/);
  expect(SRC).toMatch(/variant: 'crew'/);
});

it("renders 'left the project' and 'chose not to continue' as their own pill", () => {
  expect(SRC).toMatch(/text\.includes\('עזב את הפרויקט'\) \|\| text\.includes\('החליט\/ה לא להמשיך בפרויקט'\)/);
  expect(SRC).toMatch(/variant: 'left'/);
  expect(SRC).toMatch(/variant === 'left'\s*\?\s*<UserMinus/);
});

it("stands the screen's own swipe-back down while the review card can be swiped", () => {
  // Same motion, same starting edge (the app lays out LTR), so only one of the
  // two may be live. The screen is the single owner of the option.
  expect(SRC).toMatch(/<Stack\.Screen options=\{\{ headerShown: false, gestureEnabled: !cardSwipeable, fullScreenGestureEnabled: false, gestureResponseDistance: \{ start: 24 \} \}\} \/>/);
  expect(SRC).toMatch(/onSwipeableChange=\{setCardSwipeable\}/);
  const route = readFileSync(join(__dirname, '..', '..', '..', '..', 'app', '(client)', 'chat', '[chatId].tsx'), 'utf8');
  expect(route).not.toMatch(/gestureEnabled/);
});

it('pins swipe-back to the EDGE, because iOS 26 defaults it to the whole screen', () => {
  // fullScreenGestureEnabled defaults to TRUE on iOS 26+. Left at the default,
  // swipe-back spans the entire screen and no edge exclusion could keep a reply
  // swipe out of its way — a right-drag anywhere would leave the chat.
  //
  // 24 here against EDGE_PX = 32 in the row: the two zones are disjoint by
  // construction, which is what lets both gestures stay live at once. Widening
  // this past 32, or removing it, silently breaks the row on iOS 26 only —
  // which is precisely the kind of regression no simulator run would surface.
  expect(SRC).toMatch(/fullScreenGestureEnabled: false/);
  const distance = SRC.match(/gestureResponseDistance: \{ start: (\d+) \}/);
  expect(distance).not.toBeNull();
  expect(Number(distance![1])).toBeLessThan(EDGE_PX);
});

it('excludes system pills and listing cards from the swipeable row by RETURNING first', () => {
  /**
   * What makes `enabled` unconditional on SwipeableMessageRow safe.
   *
   * buildReplyTo refuses exactly three things — the date separator, the system
   * pill and the shared listing card — and all three return from renderItem
   * before the row wrapper is reached. So every row that gets there is
   * repliable, and a `repliable ?` ternary at the wrapper would be a branch
   * nothing could take.
   *
   * That is only true while the ordering holds. Move the listing card below the
   * wrapper and a marketplace card becomes swipeable, quoting a listing as if
   * someone had said it — which no test would otherwise notice.
   */
  const separator = SRC.indexOf("item.type === 'date-separator'");
  const systemPill = SRC.indexOf("if (msg.system || msg.senderId === 'system')");
  const listing = SRC.indexOf("if (msg.type === 'listing')");
  const row = SRC.indexOf('<SwipeableMessageRow');

  expect(separator).toBeGreaterThan(-1);
  expect(systemPill).toBeGreaterThan(-1);
  expect(listing).toBeGreaterThan(-1);
  expect(row).toBeGreaterThan(-1);

  expect(separator).toBeLessThan(row);
  expect(systemPill).toBeLessThan(row);
  expect(listing).toBeLessThan(row);
});

/**
 * The stored text is always Hebrew — written by the app and by the triggers in
 * functions/. The pill's headline is rebuilt from the variant instead, so an
 * English reader reads English.
 */
describe('system pills speak the reader s language', () => {
  const en = require('@core/i18n/translations/en.json');
  const he = require('@core/i18n/translations/he.json');
  const KEYS = [
    'system_meeting_title', 'system_mission_title', 'system_price_title',
    'system_completion_done', 'system_completion_title', 'system_crew_title',
    'system_left', 'system_declined',
  ];

  it('has every headline in both languages', () => {
    for (const k of KEYS) {
      expect(typeof en.chats[k]).toBe('string');
      expect(typeof he.chats[k]).toBe('string');
    }
    // The two sentence-shaped ones carry the name they are built around.
    expect(en.chats.system_left).toContain('{{name}}');
    expect(he.chats.system_declined).toContain('{{name}}');
  });

  it('builds every headline from a key, with no Hebrew left inline', () => {
    const parser = SRC.slice(SRC.indexOf('function parseSystemMessage'), SRC.indexOf('interface VoiceMessageBubbleProps'));
    for (const k of KEYS) expect(parser).toContain(`chats.${k}`);
    // Hebrew still appears in the parser — it is what the text is MATCHED on —
    // but never again as a headline it returns.
    expect(parser).not.toMatch(/headline: '[^']*[֐-׿]/);
  });

  it('lifts the name out of the left/declined sentence rather than echoing it', () => {
    expect(SRC).toMatch(/const name = text\.split\(phrase\)\[0\]\?\.trim\(\)/);
    expect(SRC).toMatch(/t\(declined \? 'chats\.system_declined' : 'chats\.system_left', \{ name \}\)/);
  });

  it('dates the meeting line in the reader s language', () => {
    expect(SRC).toMatch(/formatMeetingDetail\(text, lang\)/);
    expect(SRC).toMatch(/parseSystemMessage\(msg\.text \?\? '', t, rtl \? 'he' : 'en'\)/);
  });
});

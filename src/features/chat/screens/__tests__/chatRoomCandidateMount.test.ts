import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  expect(SRC).toMatch(/<Stack\.Screen options=\{\{ headerShown: false, gestureEnabled: !cardSwipeable \}\} \/>/);
  expect(SRC).toMatch(/onSwipeableChange=\{setCardSwipeable\}/);
  const route = readFileSync(join(__dirname, '..', '..', '..', '..', 'app', '(client)', '(tabs)', 'chats', '[chatId].tsx'), 'utf8');
  expect(route).not.toMatch(/gestureEnabled/);
});

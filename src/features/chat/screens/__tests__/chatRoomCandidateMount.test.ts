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
  expect(SRC.indexOf('<CandidateStatusChip')).toBeLessThan(list);
});

it('client gets the card, anyone else on the project gets the chip — by project role, not mode', () => {
  expect(SRC).toMatch(/projectClientId === currentUserId\s*\?\s*<CandidateReviewCard[^>]*clientId=\{currentUserId\}/);
  expect(SRC).toMatch(/:\s*<CandidateStatusChip[^>]*proId=\{currentUserId\}/);
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

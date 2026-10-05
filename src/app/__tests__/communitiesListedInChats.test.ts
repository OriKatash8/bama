import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Communities the user belongs to are listed in the chats tab in BOTH modes, so
 * neither tab may leave them out of its "do I have any chats" check (that check
 * picks the empty state over the list). The client tab has a behavior test
 * (chats/__tests__/communityOnly.test.tsx); the professional tab is too large to
 * mount, so this pins its one line.
 */
it('the professional chats tab counts communities toward hasChats', () => {
  const src = readFileSync(join(__dirname, '..', '(professional)', '(tabs)', 'chats', 'index.tsx'), 'utf8');
  expect(src).toMatch(/const hasChats = userChats\.length > 0;/);
  expect(src).not.toMatch(/type !== 'community'\)\.length > 0/);
});

it('ChatsScreen no longer filters communities out of the list', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'features', 'chat', 'screens', 'ChatsScreen.tsx'), 'utf8');
  expect(src).not.toMatch(/filter\(\(c\) => c\.type !== 'community'\)/);
});

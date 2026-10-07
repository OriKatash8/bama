import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Communities are NOT listed in the chats tab (either mode): each tab's "do I have any chats" check
 * leaves them out, and ChatsScreen filters them from the list. They live in the Communities tab.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

it('the professional chats tab leaves communities out of hasChats', () => {
  expect(read('(professional)', '(tabs)', 'chats', 'index.tsx')).toMatch(/const hasChats = userChats\.filter\(\(c\) => c\.type !== 'community'\)\.length > 0;/);
});

it('the client chats tab leaves communities out of hasChats', () => {
  expect(read('(client)', '(tabs)', 'chats', 'index.tsx')).toMatch(/const realChats = chats\.filter\(\(c\) => c\.type !== 'community'\);\s*const hasChats = realChats\.length > 0;/);
});

it('ChatsScreen filters communities out of the list', () => {
  expect(read('..', 'features', 'chat', 'screens', 'ChatsScreen.tsx')).toMatch(/\.filter\(\(c\) => c\.type !== 'community'\)/);
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The "Brokerage balance" button in a completed chat follows the mode, like the
 * chat's other buttons: purple for the client, blue for the pro. It was a fixed
 * green.
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('takes the mode accent', () => {
  expect(SRC).toMatch(/style=\{\[chatStyles\.payFromChatBtn, \{ backgroundColor: modeAccent \}\]\}/);
});

it('has no fixed colour of its own', () => {
  const style = SRC.slice(SRC.indexOf('payFromChatBtn: {'), SRC.indexOf('payFromChatText:'));
  expect(style).not.toMatch(/backgroundColor/);
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Photo messages render through ChatImage (own shape), not the fixed 16:9 video box. */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('photo messages use ChatImage', () => {
  expect(SRC).toMatch(/<ChatImage uri=\{msg\.imageURL\}/);
  expect(SRC).not.toMatch(/<Image source=\{\{ uri: msg\.imageURL \}\} style=\{styles\.mediaMessage\}/);
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Video messages render through ChatVideo (own shape), not a fixed 16:9 box. */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('video messages use ChatVideo', () => {
  expect(SRC).toMatch(/<ChatVideo uri=\{msg\.videoUrl\}/);
  expect(SRC).not.toMatch(/<VideoPlayer uri=\{msg\.videoUrl\} style=\{styles\.mediaMessage\}/);
});

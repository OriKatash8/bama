import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The new-messages circle on a community's icon in "My communities" is blue. */
const SRC = readFileSync(join(__dirname, '..', 'CommunityDiscoveryTab.tsx'), 'utf8');

it('the badge is the app blue, not red', () => {
  const badge = SRC.match(/\n  stripBadge: \{([\s\S]*?)\n  \},/);
  expect(badge).not.toBeNull();
  expect(badge![1]).toMatch(/backgroundColor: '#004aad'/);
  expect(badge![1]).not.toMatch(/#ef4444/);
});

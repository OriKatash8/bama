import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BAMA_CONTACT_EMAIL } from '@core/constants/contact';

/**
 * The chat room shows a project's closing message (kind 'project_closed') as the
 * ClosingTeamCard, not as a plain system pill — checked BEFORE the system branch,
 * since the message is also `system: true`. Card behaviour: ClosingTeamCard.test.
 */

const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('renders the card for a closing message, ahead of the generic system pill', () => {
  const card = SRC.indexOf("msg.kind === 'project_closed'");
  const pill = SRC.indexOf("if (msg.system || msg.senderId === 'system') {");
  expect(card).toBeGreaterThan(-1);
  expect(card).toBeLessThan(pill);
  expect(SRC.slice(card, pill)).toMatch(/<ClosingTeamCard/);
});

it('falls back to the one BAMA contact address — the same the server writes', () => {
  expect(BAMA_CONTACT_EMAIL).toBe('bama.app.hk@gmail.com');
  expect(SRC).toMatch(/contactEmail=\{msg\.contactEmail \?\? BAMA_CONTACT_EMAIL\}/);
});

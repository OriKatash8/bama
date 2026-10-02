import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The "Media" row on project details reads in black (its default is blue). */
const SRC = readFileSync(join(__dirname, '..', 'project-details.tsx'), 'utf8');

it('passes black as the Media row\'s title colour', () => {
  expect(SRC).toMatch(/<ChatMediaSection chatId=\{project\.chatId \?\? chatIdParam\} titleColor="#000000" \/>/);
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A price request's note is in the app font (Heebo in Hebrew). It was italic,
 * and Heebo has no italic face — iOS then drew the note in the system font.
 */
const SRC = readFileSync(join(__dirname, '..', 'project-details.tsx'), 'utf8');

it('the note uses the app font', () => {
  expect(SRC).toMatch(/<Text style=\{\[styles\.pendingRequestNote, \{[^}]*\.\.\.font\.regular \}\]\}>/);
});

it('and is not italic, which Heebo cannot draw', () => {
  const style = SRC.match(/pendingRequestNote: \{[^}]*\}/)![0];
  expect(style).not.toMatch(/fontStyle/);
});

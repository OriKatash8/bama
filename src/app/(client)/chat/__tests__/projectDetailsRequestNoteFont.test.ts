import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A price request's note, and the "nothing here yet" notes, are in the app font
 * (Heebo in Hebrew). They were italic, and Heebo has no italic face — iOS then
 * drew them in the system font.
 */
const SRC = readFileSync(join(__dirname, '..', 'project-details.tsx'), 'utf8');

it('the note uses the app font', () => {
  expect(SRC).toMatch(/<Text style=\{\[styles\.pendingRequestNote, \{[^}]*\.\.\.font\.regular \}\]\}>/);
});

it('and is not italic, which Heebo cannot draw', () => {
  const style = SRC.match(/pendingRequestNote: \{[^}]*\}/)![0];
  expect(style).not.toMatch(/fontStyle/);
});

it('the empty-section notes are not italic either', () => {
  const style = SRC.match(/emptyNote: \{[^}]*\}/)![0];
  expect(style).not.toMatch(/fontStyle/);
  // Every use goes through AppText, which sets the app font.
  expect(SRC.match(/style=\{styles\.emptyNote\}/g)!.length).toBe(SRC.match(/<AppText weight="regular" style=\{styles\.emptyNote\}>/g)!.length);
});

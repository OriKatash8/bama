import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The purchase banner's "waiting for the other side / the buyer" lines are in
 * the app font (Heebo in Hebrew). They were italic, and Heebo has no italic
 * face — iOS then drew them in the system font.
 */
const SRC = readFileSync(join(__dirname, '..', 'PurchaseBanner.tsx'), 'utf8');

it('both waiting lines use the app font', () => {
  expect(SRC.match(/<Text style=\{\[styles\.waitingText, \{ \.\.\.font\.regular,/g)).toHaveLength(2);
});

it('and are not italic, which Heebo cannot draw', () => {
  const style = SRC.match(/waitingText: \{[^}]*\}/)![0];
  expect(style).not.toMatch(/fontStyle/);
});

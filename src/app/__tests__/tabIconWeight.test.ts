import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The two tab bars draw their icons at the same weight. The client's used to
 * be 2.5 — visibly bolder than the pro's 1.5.
 */
const strokes = (group: string) =>
  [...readFileSync(join(__dirname, '..', group, '(tabs)', '_layout.tsx'), 'utf8')
    .matchAll(/size=\{20\} color=\{color\} strokeWidth=\{([\d.]+)\}/g)].map((m) => m[1]);

it('client tab icons match the pro tab icons: strokeWidth 1.5', () => {
  const client = strokes('(client)');
  const pro = strokes('(professional)');
  expect(client).toHaveLength(4);
  expect(pro).toHaveLength(4);
  expect(new Set([...client, ...pro])).toEqual(new Set(['1.5']));
});

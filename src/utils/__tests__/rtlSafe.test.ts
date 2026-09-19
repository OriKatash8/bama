import { rtlSafe } from '../formatters';

// A trailing "…" after Hebrew renders on the wrong side in the LTR-laid-out app;
// an invisible right-to-left mark anchors it to the Hebrew end.
it('appends an RLM in Hebrew, leaves the visible text unchanged', () => {
  const out = rtlSafe('חיפוש…', true);
  expect(out).toBe('חיפוש…‏');
  expect(out.replace('‏', '')).toBe('חיפוש…');
});

it('leaves English untouched', () => {
  expect(rtlSafe('Search…', false)).toBe('Search…');
});

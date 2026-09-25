import { act, renderHook } from '@testing-library/react-native';
import { useVanishingList } from '../useVanishingList';

type Item = { id: string };
const ids = (rows: { item: Item; leaving: boolean }[]) => rows.map((r) => `${r.item.id}${r.leaving ? '~' : ''}`);
const list = (...xs: string[]) => xs.map((id) => ({ id }));

function setup(initial: Item[]) {
  return renderHook(({ items }: { items: Item[] }) => useVanishingList(items, (i) => i.id), {
    initialProps: { items: initial },
  });
}

it('marks a row leaving, then hides it once it has collapsed', () => {
  const h = setup(list('a', 'b', 'c'));
  act(() => h.result.current.start(['b']));
  expect(ids(h.result.current.rows)).toEqual(['a', 'b~', 'c']);
  act(() => h.result.current.finish('b'));
  expect(ids(h.result.current.rows)).toEqual(['a', 'c']);
});

it('keeps a leaving row on screen, in place, when the live list drops it mid-collapse', () => {
  const h = setup(list('a', 'b', 'c'));
  act(() => h.result.current.start(['b']));
  h.rerender({ items: list('a', 'c') });
  expect(ids(h.result.current.rows)).toEqual(['a', 'b~', 'c']);
  act(() => h.result.current.finish('b'));
  expect(ids(h.result.current.rows)).toEqual(['a', 'c']);
});

it('brings a row back when the write fails, even after it collapsed', () => {
  const h = setup(list('a', 'b'));
  act(() => h.result.current.start(['b']));
  act(() => h.result.current.finish('b'));
  act(() => h.result.current.revert(['b']));
  expect(ids(h.result.current.rows)).toEqual(['a', 'b']);
});

it('does not hide someone who comes back later (a new request from the same uid)', () => {
  const h = setup(list('a', 'b'));
  act(() => h.result.current.start(['b']));
  act(() => h.result.current.finish('b'));
  h.rerender({ items: list('a') }); // the server caught up
  h.rerender({ items: list('a', 'b') }); // they asked again
  expect(ids(h.result.current.rows)).toEqual(['a', 'b']);
});

it('handles several leaving at once (approve all)', () => {
  const h = setup(list('a', 'b', 'c'));
  act(() => h.result.current.start(['a', 'b', 'c']));
  expect(ids(h.result.current.rows)).toEqual(['a~', 'b~', 'c~']);
});

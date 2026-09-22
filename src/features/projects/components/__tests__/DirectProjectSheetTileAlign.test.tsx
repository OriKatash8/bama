import React from 'react';
import { StyleSheet } from 'react-native';
import { render, act } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { DirectProjectSheet } from '../DirectProjectSheet';

/**
 * THE THREE TILE ICONS SIT ON ONE LINE, WHATEVER THE LABELS DO.
 *
 * Each tile centres a column of [icon, label]. The label is capped at two
 * lines but used to claim only the height it needed, so on a phone — narrow
 * enough that one label wraps and its neighbour does not — the taller tile
 * centred its icon higher than the others. A desktop browser never showed it,
 * because at that width nothing wraps.
 *
 * The icon's offset from the top of its tile is (tileHeight - contentHeight)/2,
 * so equal content heights are what put the icons on one line. This asserts the
 * reserved label height directly: it is the thing that was unequal.
 */

jest.mock('@core/firebase/firestore', () => ({
  addDocument: jest.fn(),
  getDocument: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('@features/crew/components', () => ({ MiniCalendar: () => null }));
jest.mock('react-native-reanimated', () => require('../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'client-1' } }),
}));

async function openSheet() {
  const r = render(
    <DirectProjectSheet visible professionalId="pro-1" professionalName="Dana" onClose={jest.fn()} onSubmitted={jest.fn()} />,
  );
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

/**
 * The label inside a tile: its only descendant Text that reserves a height.
 *
 * One Text shows up twice in the tree — once as the composite element, once as
 * the host it renders to — carrying the same style both times, so consecutive
 * identical hits collapse to one.
 */
function labelBox(tile: ReactTestInstance) {
  const boxes: { minHeight: number; lineHeight: number; numberOfLines?: number }[] = [];
  const visit = (n: ReactTestInstance) => {
    const s = StyleSheet.flatten(n.props?.style) as { minHeight?: number; lineHeight?: number } | undefined;
    if (s?.lineHeight && typeof n.props?.numberOfLines === 'number') {
      const box = { minHeight: s.minHeight ?? 0, lineHeight: s.lineHeight, numberOfLines: n.props.numberOfLines };
      const last = boxes[boxes.length - 1];
      if (!last || JSON.stringify(last) !== JSON.stringify(box)) boxes.push(box);
    }
    n.children.forEach((c) => typeof c !== 'string' && visit(c));
  };
  visit(tile);
  return boxes;
}

it('reserves the same label height in all three tiles, so the icons line up', async () => {
  const r = await openSheet();

  const heights = ['tile-exec', 'tile-deadline', 'tile-location']
    .map((id) => labelBox(r.getByTestId(id)))
    .map((boxes) => {
      expect(boxes).toHaveLength(1);
      return boxes[0].minHeight;
    });

  expect(new Set(heights).size).toBe(1);
  // Zero would mean "whatever the text needs", which is the bug: a wrapped
  // label would then be taller than an unwrapped one.
  expect(heights[0]).toBeGreaterThan(0);
});

it('reserves exactly the two lines the label is capped at', async () => {
  const r = await openSheet();

  const [box] = labelBox(r.getByTestId('tile-location'));
  expect(box.numberOfLines).toBe(2);
  // Reserving fewer lines than the cap allows would let a wrapped label grow
  // past the reservation and reintroduce the mismatch.
  expect(box.minHeight).toBe(box.lineHeight * box.numberOfLines!);
});

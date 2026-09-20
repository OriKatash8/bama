import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { DirectProjectSheet } from '../DirectProjectSheet';
import en from '@core/i18n/translations/en.json';

/**
 * Execution, deadline and location are the home builder's three squares, not
 * the labelled rows this sheet used to have: one row, in that order, dates
 * written dd/mm/yyyy, and a ✕ that appears only once there is something to
 * clear. KEEP IN SYNC with (client)/(tabs)/home/index.tsx.
 */

jest.mock('@core/firebase/firestore', () => ({
  addDocument: jest.fn(() => Promise.resolve('project-1')),
  getDocument: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('@features/crew/components', () => {
  const RN = jest.requireActual('react-native');
  return {
    MiniCalendar: ({ onSelect, onClose }: { onSelect: (iso: string) => void; onClose: () => void }) => (
      <RN.TouchableOpacity testID="pick-date" onPress={() => { onSelect('2099-01-15'); onClose(); }}>
        <RN.Text>pick</RN.Text>
      </RN.TouchableOpacity>
    ),
  };
});
jest.mock('react-native-reanimated', () => require('../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'client-1' } }),
}));

async function open() {
  const r = render(
    <DirectProjectSheet visible professionalId="pro-1" professionalName="Dana" onClose={jest.fn()} onSubmitted={jest.fn()} />,
  );
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

/**
 * Every testID in render order — `props.children` misses anything a component
 * returned rather than received, so the whole tree is walked. One testID lands
 * on several nested layers (composite + host), so consecutive repeats collapse
 * to one; the ORDER is what this is for.
 */
function testIDsInOrder(root: ReactTestInstance): string[] {
  const out: string[] = [];
  const visit = (node: ReactTestInstance) => {
    const id = node.props?.testID;
    if (typeof id === 'string' && id !== out[out.length - 1]) out.push(id);
    node.children.forEach((c) => typeof c !== 'string' && visit(c));
  };
  visit(root);
  return out;
}

it('lays the three tiles out in one row: execution, deadline, location', async () => {
  const r = await open();

  const ids = testIDsInOrder(r.root).filter((id) => id.startsWith('tile-'));
  expect(ids).toEqual(['tile-exec', 'tile-deadline', 'tile-location']);
});

it('writes a picked date dd/mm/yyyy, not as the stored ISO string', async () => {
  const r = await open();

  await act(async () => { fireEvent.press(r.getByTestId('tile-deadline')); });
  await act(async () => { fireEvent.press(r.getByTestId('pick-date')); });

  expect(r.getByText('15/01/2099')).toBeTruthy();
  expect(r.queryByText('2099-01-15')).toBeNull();
});

it('shows the clear ✕ only once a tile holds a value, and clears it', async () => {
  const r = await open();

  expect(r.queryByTestId('clear-location')).toBeNull();

  await act(async () => { fireEvent.press(r.getByTestId('tile-location')); });
  await act(async () => { fireEvent.press(r.getByText('Tel Aviv')); });
  expect(r.getByText('Tel Aviv')).toBeTruthy();

  // The ✕ guards against the press bubbling to the tile behind it, so it is
  // handed an event the way React Native would.
  await act(async () => { fireEvent.press(r.getByTestId('clear-location'), { stopPropagation: () => {} }); });

  expect(r.queryByTestId('clear-location')).toBeNull();
  expect(r.getByText(en.builder.placeholder_location)).toBeTruthy();
});

it('marks only the execution tile optional — this sheet requires a location', async () => {
  const r = await open();

  expect(r.getAllByText(en.builder.optional_note)).toHaveLength(1);
});

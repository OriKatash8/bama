import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import { DirectProjectSheet } from '../DirectProjectSheet';
import { addDocument } from '@core/firebase/firestore';
import en from '@core/i18n/translations/en.json';

/**
 * The client names their own project.
 *
 * The sheet used to have no name field at all: it asked an LLM for a title from
 * the description after submit, then made the client confirm it in a second
 * modal. Now the name is the first field of the form, it is required, and what
 * the client types is exactly what lands in Firestore — no second step.
 */

jest.mock('@core/firebase/firestore', () => ({
  addDocument: jest.fn(() => Promise.resolve('project-1')),
  getDocument: jest.fn(() => Promise.resolve({
    roleSkills: [{ role: 'videographer', specializations: ['events'] }],
  })),
}));
// A stub calendar that answers with one fixed far-future date, so the form can
// be completed without driving a real month grid.
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
jest.mock('@components/ui/HelpTooltip', () => ({ HelpTooltip: () => null }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'client-1' } }),
}));

const mockAdd = addDocument as jest.Mock;

async function open() {
  const r = render(
    <DirectProjectSheet visible professionalId="pro-1" professionalName="Dana" onClose={jest.fn()} onSubmitted={jest.fn()} />,
  );
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

beforeEach(() => mockAdd.mockClear());

/** Fills every required field; `name` decides whether the new one is among them. */
async function fill(r: ReturnType<typeof render>, { name }: { name: boolean }) {
  if (name) {
    fireEvent.changeText(r.getByPlaceholderText(en.builder.placeholder_title), '  Rooftop launch film  ');
  }
  fireEvent.changeText(r.getByPlaceholderText(en.builder.tell_us_placeholder), 'A launch film.');

  // Deadline, through the stub calendar.
  await act(async () => { fireEvent.press(r.getByText(en.builder.placeholder_deadline)); });
  await act(async () => { fireEvent.press(r.getByTestId('pick-date')); });

  // Location, through the city picker.
  await act(async () => { fireEvent.press(r.getByText(en.builder.placeholder_location)); });
  await act(async () => { fireEvent.press(r.getByText('Tel Aviv')); });

  // One crew slot.
  await act(async () => { fireEvent.press(r.getByText('+')); });
}

it('asks for a project name before anything else', async () => {
  const r = await open();

  expect(r.getByText(en.builder.title)).toBeTruthy();
  expect(r.getByPlaceholderText(en.builder.placeholder_title)).toBeTruthy();
});

it('refuses to submit without a name', async () => {
  const r = await open();

  // A form that is complete in every OTHER respect, so the only thing that can
  // hold the submit back is the missing name.
  await fill(r, { name: false });
  await act(async () => { fireEvent.press(r.getByText(en.search.tell_us_about_project)); });

  expect(mockAdd).not.toHaveBeenCalled();
});

it('stores the name the client typed, with no confirmation step', async () => {
  const r = await open();

  await fill(r, { name: true });
  await act(async () => { fireEvent.press(r.getByText(en.search.tell_us_about_project)); });

  expect(mockAdd).toHaveBeenCalledTimes(1);
  const [collection, payload] = mockAdd.mock.calls[0];
  expect(collection).toBe('projects');
  // Trimmed, and never an LLM's phrasing of the description.
  expect(payload.title).toBe('Rooftop launch film');
  expect(payload.description).toBe('A launch film.');
});

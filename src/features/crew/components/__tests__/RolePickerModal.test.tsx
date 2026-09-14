import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RolePickerModal } from '../RolePickerModal';
import { CATEGORIES } from '../../data/roleTiles';
import en from '@core/i18n/translations/en.json';

/**
 * "Add professional" on project details: a compact version of the home builder's
 * steps 2 and 3. Pick roles and how many (tiles with − count +), then a subskill
 * per slot, then post. Same state as the home builder (useCrewBuilder), and the
 * same slot shape handed to onPost.
 */

jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const pd = en.project_details;

function renderSheet(onPost = jest.fn(), onDismiss = jest.fn()) {
  const r = render(<RolePickerModal visible onDismiss={onDismiss} onPost={onPost} />);
  return { r, onPost, onDismiss };
}

it('step 1 shows every role tile; continue is disabled until one is picked', () => {
  const { r } = renderSheet();
  expect(r.getByText(pd.add_pro_step_roles)).toBeTruthy();
  // Tiles are keyed by the stored category string, the same list the home builder uses.
  expect(CATEGORIES).toHaveLength(8);
  for (const { key } of CATEGORIES) expect(r.getByTestId(`role-tile-${key}`)).toBeTruthy();
  expect(r.getByRole('button', { name: pd.add_pro_continue }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
});

it('tapping a tile adds one; − and + change the count', () => {
  const { r } = renderSheet();
  fireEvent.press(r.getByTestId('role-tile-Editor'));
  expect(r.getByTestId('role-count-Editor')).toHaveTextContent('1');
  fireEvent.press(r.getByTestId('role-plus-Editor'));
  expect(r.getByTestId('role-count-Editor')).toHaveTextContent('2');
  fireEvent.press(r.getByTestId('role-minus-Editor'));
  expect(r.getByTestId('role-count-Editor')).toHaveTextContent('1');
  fireEvent.press(r.getByTestId('role-minus-Editor'));
  expect(r.queryByTestId('role-count-Editor')).toBeNull();
});

it('step 2 lists a card per role and a subskill row per slot; back keeps the choices', () => {
  const { r } = renderSheet();
  fireEvent.press(r.getByTestId('role-tile-Editor'));
  fireEvent.press(r.getByTestId('role-plus-Editor'));
  fireEvent.press(r.getByRole('button', { name: pd.add_pro_continue }));

  expect(r.getByText(pd.add_pro_step_subskills)).toBeTruthy();
  expect(r.getByText(pd.add_pro_needed.replace('{{n}}', '2'))).toBeTruthy();
  expect(r.getAllByTestId(/^slot-row-Editor-\d$/)).toHaveLength(2);

  fireEvent.press(r.getByTestId('slot-pill-Editor-1-video'));
  expect(r.getByTestId('slot-pill-Editor-1-video').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));

  fireEvent.press(r.getByRole('button', { name: pd.add_pro_back }));
  expect(r.getByTestId('role-count-Editor')).toHaveTextContent('2');
  fireEvent.press(r.getByRole('button', { name: pd.add_pro_continue }));
  expect(r.getByTestId('slot-pill-Editor-1-video').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
});

it('posts the slots with their subskills', () => {
  const { r, onPost } = renderSheet();
  fireEvent.press(r.getByTestId('role-tile-Editor'));
  fireEvent.press(r.getByTestId('role-plus-Editor'));
  fireEvent.press(r.getByTestId('role-tile-Lighting Tech'));
  fireEvent.press(r.getByRole('button', { name: pd.add_pro_continue }));
  fireEvent.press(r.getByTestId('slot-pill-Editor-1-video'));
  fireEvent.press(r.getByRole('button', { name: pd.post_roles }));
  expect(onPost).toHaveBeenCalledTimes(1);
  expect(onPost.mock.calls[0][0]).toEqual(expect.arrayContaining([
    { category: 'Editor', quantity: 1 },
    { category: 'Editor', quantity: 1, requiredCapability: 'video' },
    { category: 'Lighting Tech', quantity: 1 },
  ]));
  expect(onPost.mock.calls[0][0]).toHaveLength(3);
});

it('closing clears the selection and returns to step 1', () => {
  const onDismiss = jest.fn();
  const r = render(<RolePickerModal visible onDismiss={onDismiss} onPost={jest.fn()} />);
  fireEvent.press(r.getByTestId('role-tile-Editor'));
  fireEvent.press(r.getByRole('button', { name: pd.add_pro_continue }));
  fireEvent.press(r.getByRole('button', { name: pd.add_pro_close }));
  expect(onDismiss).toHaveBeenCalled();
  r.rerender(<RolePickerModal visible onDismiss={onDismiss} onPost={jest.fn()} />);
  expect(r.getByText(pd.add_pro_step_roles)).toBeTruthy();
  expect(r.queryByTestId('role-count-Editor')).toBeNull();
});

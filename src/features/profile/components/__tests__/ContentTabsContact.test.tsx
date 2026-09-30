import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ContentTabs } from '../ContentTabs';
import en from '@core/i18n/translations/en.json';

jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const onEquipmentChange = jest.fn();
const props = { equipment: [{ name: 'FX3', category: 'camera' }], reviews: [], isEditing: true, onEquipmentChange };

beforeEach(() => jest.clearAllMocks());

function typeAndAdd(r: ReturnType<typeof render>, text: string) {
  fireEvent.changeText(r.getByPlaceholderText(en.profile_sections.add_item), text);
  fireEvent.press(r.getByText('+'));
}

it('will not add an item with a phone number; the error shows and the text stays', () => {
  const r = render(<ContentTabs {...props} />);
  typeAndAdd(r, 'צלמו אלי 054-7654321');
  expect(onEquipmentChange).not.toHaveBeenCalled();
  expect(r.getByText(en.profile.error_no_phone)).toBeTruthy();
  expect(r.getByDisplayValue('צלמו אלי 054-7654321')).toBeTruthy();
});

it('adds an ordinary item', () => {
  const r = render(<ContentTabs {...props} />);
  typeAndAdd(r, 'Sony 24-70mm f/2.8');
  expect(onEquipmentChange).toHaveBeenCalledWith([
    { name: 'FX3', category: 'camera' },
    { name: 'Sony 24-70mm f/2.8', category: 'camera' },
  ]);
  expect(r.queryByText(en.profile.error_no_phone)).toBeNull();
});

it('the error clears once the text changes', () => {
  const r = render(<ContentTabs {...props} />);
  typeAndAdd(r, '052-123-4567');
  fireEvent.changeText(r.getByPlaceholderText(en.profile_sections.add_item), 'Rode NTG');
  expect(r.queryByText(en.profile.error_no_phone)).toBeNull();
});

it('stops at 30 items', () => {
  const full = Array.from({ length: 30 }, (_, i) => ({ name: `item ${i}`, category: 'other' }));
  const r = render(<ContentTabs {...props} equipment={full} />);
  typeAndAdd(r, 'one more');
  expect(onEquipmentChange).not.toHaveBeenCalled();
  expect(r.getByText(en.profile.error_equipment_limit)).toBeTruthy();
});

it('marks an existing item that carries a phone', () => {
  const r = render(
    <ContentTabs {...props} equipment={[{ name: 'FX3', category: 'camera' }, { name: '052-123-4567', category: 'camera' }]} badEquipmentIndexes={[1]} />,
  );
  expect(r.getByTestId('equipment-chip-1-error')).toBeTruthy();
  expect(r.queryByTestId('equipment-chip-0-error')).toBeNull();
  expect(r.getByText(en.profile.error_no_phone)).toBeTruthy();
});

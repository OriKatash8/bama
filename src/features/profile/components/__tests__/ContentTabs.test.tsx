import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ContentTabs } from '../ContentTabs';

jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: { language: string }) => unknown) =>
    selector({ language: 'en' }),
}));

const baseProps = {
  equipment: ['Sony FX3', 'DJI RS3'],
  reviews: [],
  isEditing: false,
  onEquipmentChange: jest.fn(),
};

describe('ContentTabs', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  it('renders equipment and reviews tab buttons', () => {
    const { getAllByText, getByText } = render(<ContentTabs {...baseProps} />);
    // Equipment appears in tab bar AND section header (default active tab)
    expect(getAllByText('Equipment').length).toBeGreaterThanOrEqual(1);
    expect(getByText('Reviews')).toBeTruthy();
  });

  it('shows equipment items on initial render (equipment tab is default)', () => {
    const { getByText } = render(<ContentTabs {...baseProps} />);
    expect(getByText('Sony FX3')).toBeTruthy();
    expect(getByText('DJI RS3')).toBeTruthy();
  });

  it('switches to reviews content when tapping Reviews tab', async () => {
    const { getByText, queryByText } = render(<ContentTabs {...baseProps} />);
    await act(async () => {
      fireEvent.press(getByText('Reviews'));
      jest.runAllTimers();
    });
    expect(queryByText('Sony FX3')).toBeNull();
    expect(queryByText('DJI RS3')).toBeNull();
  });

  it('switches back to equipment when tapping Equipment tab after Reviews', async () => {
    const { getByText, getAllByText, queryByText } = render(<ContentTabs {...baseProps} />);
    await act(async () => {
      fireEvent.press(getByText('Reviews'));
      jest.runAllTimers();
    });
    await act(async () => {
      // After switching to Reviews, "Equipment" only appears in the tab bar
      fireEvent.press(getByText('Equipment'));
      jest.runAllTimers();
    });
    expect(queryByText('Sony FX3')).toBeTruthy();
  });
});

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ContentTabs } from '../ContentTabs';
import { ROLES, getSpecializations, labelOf } from '@features/crew/data/categories';

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

  it('equipment tab is default: categories start closed and open on tap', () => {
    const { getByText, queryByText } = render(<ContentTabs {...baseProps} />);
    // Legacy string items land in "Other"; its items are hidden until opened.
    expect(getByText('Other')).toBeTruthy();
    expect(queryByText('Sony FX3')).toBeNull();
    fireEvent.press(getByText('Other'));
    expect(getByText('Sony FX3')).toBeTruthy();
    expect(getByText('DJI RS3')).toBeTruthy();
    // Tapping again closes it.
    fireEvent.press(getByText('Other'));
    expect(queryByText('Sony FX3')).toBeNull();
  });

  it('each category opens on its own', () => {
    const { getByText, queryByText } = render(
      <ContentTabs
        {...baseProps}
        equipment={[{ name: 'FX3', category: 'camera' }, { name: 'Rode NTG', category: 'audio' }]}
      />,
    );
    fireEvent.press(getByText('Cameras'));
    expect(getByText('FX3')).toBeTruthy();
    expect(queryByText('Rode NTG')).toBeNull();
  });

  it('edit mode shows every category open, so items can be removed', () => {
    const { getByText } = render(<ContentTabs {...baseProps} isEditing />);
    expect(getByText('Sony FX3')).toBeTruthy();
  });

  it('skills: a role starts closed and shows its subskills on tap', async () => {
    const { getByText, getByTestId } = render(
      <ContentTabs {...baseProps} roleSkills={[{ role: ROLES[0].id, specializations: ['general'] }]} />,
    );
    await act(async () => {
      fireEvent.press(getByText('Skills'));
      jest.runAllTimers();
    });
    const header = getByTestId(`section-sk:${ROLES[0].id}`);
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    fireEvent.press(header);
    expect(getByTestId(`section-sk:${ROLES[0].id}`).props.accessibilityState).toEqual({ expanded: true });
    expect(getByText(labelOf(getSpecializations(ROLES[0].id).find((x) => x.id === 'general')!, 'en'))).toBeTruthy();
  });

  it('switches to reviews content when tapping Reviews tab', async () => {
    const { getByText, queryByText } = render(<ContentTabs {...baseProps} />);
    await act(async () => {
      fireEvent.press(getByText('Reviews'));
      jest.runAllTimers();
    });
    // The equipment categories are gone with the equipment tab.
    expect(queryByText('Other')).toBeNull();
  });

  it('switches back to equipment when tapping Equipment tab after Reviews', async () => {
    const { getByText, queryByText } = render(<ContentTabs {...baseProps} />);
    await act(async () => {
      fireEvent.press(getByText('Reviews'));
      jest.runAllTimers();
    });
    await act(async () => {
      // After switching to Reviews, "Equipment" only appears in the tab bar
      fireEvent.press(getByText('Equipment'));
      jest.runAllTimers();
    });
    expect(queryByText('Other')).toBeTruthy();
  });
});

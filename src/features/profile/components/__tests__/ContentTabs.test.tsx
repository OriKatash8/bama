import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ContentTabs } from '../ContentTabs';

const baseProps = {
  equipment: ['Sony FX3', 'DJI RS3'],
  priceList: [{ service: 'Day rate', price: 500 }],
  reviews: [],
  isEditing: false,
  onEquipmentChange: jest.fn(),
  onPriceListChange: jest.fn(),
};

describe('ContentTabs', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  it('renders all three tab buttons', () => {
    const { getByText } = render(<ContentTabs {...baseProps} />);
    expect(getByText('Equipment')).toBeTruthy();
    expect(getByText('Price List')).toBeTruthy();
    expect(getByText('Reviews')).toBeTruthy();
  });

  it('shows equipment panel after tapping Equipment', async () => {
    const { getByText } = render(<ContentTabs {...baseProps} />);
    await act(async () => {
      fireEvent.press(getByText('Equipment'));
      jest.runAllTimers();
    });
    expect(getByText('Sony FX3')).toBeTruthy();
  });

  it('hides panel after tapping active tab again', async () => {
    const { getByText, queryByText } = render(<ContentTabs {...baseProps} />);
    await act(async () => {
      fireEvent.press(getByText('Equipment'));
      jest.runAllTimers();
    });
    await act(async () => {
      fireEvent.press(getByText('Equipment'));
      jest.runAllTimers();
    });
    expect(queryByText('Sony FX3')).toBeNull();
  });

  it('switches content when tapping a different tab', async () => {
    const { getByText, queryByText } = render(<ContentTabs {...baseProps} />);
    await act(async () => {
      fireEvent.press(getByText('Equipment'));
      jest.runAllTimers();
    });
    await act(async () => {
      fireEvent.press(getByText('Price List'));
      jest.runAllTimers();
    });
    expect(queryByText('Sony FX3')).toBeNull();
    expect(getByText('Day rate')).toBeTruthy();
  });
});

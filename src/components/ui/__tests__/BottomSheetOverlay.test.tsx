import React from 'react';
import { Modal, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { BottomSheet } from '../BottomSheet';
import { MiniCalendar } from '@features/crew/components/MiniCalendar';

/**
 * A calendar opened from inside a sheet must live in the SHEET'S Modal. Two Modals
 * stacked on iOS can be left half-dismissed, with an invisible layer that eats touches
 * until the screen is rebuilt.
 */
jest.mock('react-native-safe-area-context', () => ({ initialWindowMetrics: { insets: { bottom: 0 } }, SafeAreaInsetsContext: require('react').createContext(null) }));

describe('BottomSheet overlay', () => {
  it('draws the overlay inside the sheet\'s own Modal — still exactly one Modal', () => {
    const r = render(
      <BottomSheet visible onClose={jest.fn()} overlay={<Text>overlay</Text>}>
        <Text>body</Text>
      </BottomSheet>,
    );
    expect(r.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    expect(r.getByText('overlay')).toBeTruthy();
    expect(r.getByText('body')).toBeTruthy();
  });

  it('with a calendar inline: still one Modal, and no second one appears', () => {
    const r = render(
      <BottomSheet visible onClose={jest.fn()} overlay={<MiniCalendar inline value="" onSelect={jest.fn()} onClose={jest.fn()} />}>
        <Text>body</Text>
      </BottomSheet>,
    );
    expect(r.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    expect(r.getByTestId('mini-calendar-inline')).toBeTruthy();
  });

  it('Android Back goes to the overlay first, then the sheet', () => {
    const onClose = jest.fn();
    const onOverlayBack = jest.fn();
    const withOverlay = render(
      <BottomSheet visible onClose={onClose} onOverlayBack={onOverlayBack} overlay={<Text>o</Text>}><Text>b</Text></BottomSheet>,
    );
    withOverlay.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onOverlayBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    const without = render(
      <BottomSheet visible onClose={onClose} onOverlayBack={onOverlayBack} overlay={null}><Text>b</Text></BottomSheet>,
    );
    without.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is edge to edge on Android (so the keyboard can be measured)', () => {
    const r = render(<BottomSheet visible onClose={jest.fn()}><Text>b</Text></BottomSheet>);
    const m = r.UNSAFE_getByType(Modal);
    expect(m.props.statusBarTranslucent).toBe(true);
    expect(m.props.navigationBarTranslucent).toBe(true);
  });
});

describe('MiniCalendar inline', () => {
  it('renders no Modal, and picking a day selects then closes', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const r = render(<MiniCalendar inline value="" onSelect={onSelect} onClose={onClose} />);
    expect(r.UNSAFE_queryAllByType(Modal)).toHaveLength(0);
    fireEvent.press(r.getAllByText('15')[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-15$/);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is still a Modal of its own by default (every other caller is unchanged)', () => {
    const r = render(<MiniCalendar value="" onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(r.UNSAFE_getAllByType(Modal)).toHaveLength(1);
  });
});

import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { AdminText, PillButton, WhoBlock, Row } from '@features/communityAdmin/components/primitives';
import { Segment } from '@features/communityAdmin/components/AdminHeader';
import { CardHead } from '../AdminPage';
import { AdminSheet } from '../AdminSheet';
import { PHONE_MAX_WIDTH, useIsPhone } from '../useIsPhone';

/**
 * The shared admin pieces at PHONE width (375px): text wraps instead of
 * ellipsising, wide controls scroll or drop to a second line, buttons stack, a sheet fits the
 * window. The window size is mocked, so each case states the width it is about.
 */
let mockW = 375;
let mockLang = 'en';
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockW, height: 667, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-reanimated', () => require('../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 34 }) }));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { displayName: string } }) => unknown) => s({ user: { displayName: 'Dana Admin' } }),
}));

beforeEach(() => { mockW = 375; mockLang = 'en'; });

describe('useIsPhone', () => {
  function Probe() { return <Text testID="p">{String(useIsPhone())}</Text>; }
  it('is true below the phone breakpoint and false from it', () => {
    mockW = PHONE_MAX_WIDTH - 1;
    expect(render(<Probe />).getByTestId('p').props.children).toBe('true');
    mockW = PHONE_MAX_WIDTH;
    expect(render(<Probe />).getByTestId('p').props.children).toBe('false');
  });
});

describe('WhoBlock wraps instead of cutting', () => {
  it('lets the name and meta take two lines by default, and more when asked', () => {
    const r = render(<WhoBlock name="A long community name" meta="owner · 12 members · cat" textAlign="left" />);
    expect(r.getByText('A long community name').props.numberOfLines).toBe(2);
    expect(r.getByText('owner · 12 members · cat').props.numberOfLines).toBe(2);
    const more = render(<WhoBlock name="n" meta="m" metaLines={4} nameLines={3} textAlign="left" />);
    expect(more.getByText('m').props.numberOfLines).toBe(4);
    expect(more.getByText('n').props.numberOfLines).toBe(3);
  });

  it('makes an email or an id copyable only when asked', () => {
    const plain = render(<WhoBlock name="n" meta="a@b.co" textAlign="left" />);
    expect(plain.getByText('a@b.co').props.selectable).toBeFalsy();
    const copy = render(<WhoBlock name="uid-123" meta="a@b.co" selectableMeta selectableName textAlign="left" />);
    expect(copy.getByText('a@b.co').props.selectable).toBe(true);
    expect(copy.getByText('uid-123').props.selectable).toBe(true);
  });
});

describe('Row wrap and PillButton block', () => {
  it('a wrapping Row lets trailing items drop to a second line', () => {
    const r = render(<Row rowDir="row" wrap testID="r"><Text>x</Text></Row>);
    const flat = StyleSheet.flatten(r.getByTestId('r').props.style);
    expect(flat.flexWrap).toBe('wrap');
    expect(StyleSheet.flatten(render(<Row rowDir="row" testID="r2"><Text>x</Text></Row>).getByTestId('r2').props.style).flexWrap).toBeUndefined();
  });

  it('block stretches a button to the full width, centred', () => {
    const r = render(<PillButton label="Approve" block onPress={() => {}} testID="b" />);
    expect(StyleSheet.flatten(r.getByTestId('b').props.style)).toMatchObject({ alignSelf: 'stretch', alignItems: 'center' });
    const plain = render(<PillButton label="x" onPress={() => {}} testID="b2" />);
    expect(StyleSheet.flatten(plain.getByTestId('b2').props.style).alignSelf).toBeUndefined();
  });
});

describe('CardHead wraps', () => {
  it('lets a wide side control drop under a two-line title', () => {
    const r = render(<CardHead title="A long card title that would not fit" sub="sub" side={<Text>side</Text>} />);
    expect(r.getByText('A long card title that would not fit').props.numberOfLines).toBe(2);
    // Walk up from the title to the head container (the first ancestor that lays out as a wrapping row).
    let node = r.getByText('A long card title that would not fit').parent;
    let wraps = false;
    while (node && !wraps) {
      wraps = StyleSheet.flatten(node.props?.style)?.flexWrap === 'wrap';
      node = node.parent;
    }
    expect(wraps).toBe(true);
  });
});

describe('a scrollable Segment', () => {
  const options = [{ value: 'a', label: 'One (3)' }, { value: 'b', label: 'Two (12)' }, { value: 'c', label: 'Three (0)' }];
  const seg = () => <Segment options={options} value="a" onChange={() => {}} label="x" testIDPrefix="tab" scroll />;

  it('scrolls sideways only when asked', () => {
    expect(render(seg()).getByTestId('tab-scroll')).toBeTruthy();
    const plain = render(<Segment options={options} value="a" onChange={() => {}} label="x" testIDPrefix="tab" />);
    expect(plain.queryByTestId('tab-scroll')).toBeNull();
  });

  it('in Hebrew it is scrolled to the right edge, so the first option is not off-screen; in English it is not', () => {
    const spy = jest.spyOn(ScrollView.prototype as { scrollToEnd: () => void }, 'scrollToEnd').mockImplementation(() => {});
    mockLang = 'he';
    const he = render(seg());
    fireEvent(he.getByTestId('tab-scroll'), 'contentSizeChange', 500, 40);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    mockLang = 'en';
    const en = render(seg());
    fireEvent(en.getByTestId('tab-scroll'), 'contentSizeChange', 500, 40);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('AdminSheet fits the window', () => {
  it('caps the card to the window minus the safe areas and the overlay padding, and shows its content', () => {
    const r = render(
      <AdminSheet visible onClose={() => {}} closeLabel="Close" testID="sheet">
        <AdminText>inside</AdminText>
      </AdminSheet>,
    );
    expect(r.getByText('inside')).toBeTruthy();
    // 667 tall - 20 top - 34 bottom - 2×16 overlay padding
    expect(StyleSheet.flatten(r.getByTestId('sheet').props.style).maxHeight).toBe(667 - 20 - 34 - 32);
    expect(r.getByLabelText('Close')).toBeTruthy();
  });

  it('renders nothing while closed', () => {
    const r = render(<AdminSheet visible={false} onClose={() => {}} closeLabel="Close"><AdminText>inside</AdminText></AdminSheet>);
    expect(r.queryByText('inside')).toBeNull();
  });
});

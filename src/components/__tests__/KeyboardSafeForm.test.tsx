import React from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { render } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { KEYBOARD_MODAL_PROPS, KeyboardSafeForm, KeyboardSafeView } from '../KeyboardSafeForm';
import { Screen } from '../layout/Screen';

/**
 * The library's Jest mock renders its components as plain RN ones, so the keyboard
 * itself can't be exercised here. What this pins is the CHOICE of component per case
 * (the thing that, wrong, nests a FlatList in a ScrollView or breaks web) and the wiring.
 */
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));

const realOS = Platform.OS;
afterEach(() => { Platform.OS = realOS; });
const read = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');

describe('KeyboardSafeForm', () => {
  it('on a phone: keyboard-aware with a margin, taps handled', () => {
    Platform.OS = 'ios';
    const r = render(<KeyboardSafeForm testID="f"><Text>x</Text></KeyboardSafeForm>);
    const sv = r.UNSAFE_getByType(ScrollView);
    expect(sv.props.bottomOffset).toBe(24);
    expect(sv.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('passes props through and lets the caller override the margin and taps', () => {
    Platform.OS = 'android';
    const r = render(
      <KeyboardSafeForm bottomOffset={8} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
        <Text>x</Text>
      </KeyboardSafeForm>,
    );
    const sv = r.UNSAFE_getByType(ScrollView);
    expect(sv.props.bottomOffset).toBe(8);
    expect(sv.props.keyboardShouldPersistTaps).toBe('always');
    expect(sv.props.showsVerticalScrollIndicator).toBe(false);
  });

  it('on web: the plain ScrollView it always was (no library props)', () => {
    Platform.OS = 'web' as never;
    const r = render(<KeyboardSafeForm><Text>x</Text></KeyboardSafeForm>);
    expect(r.UNSAFE_getByType(ScrollView).props.bottomOffset).toBeUndefined();
  });
});

describe('Screen picks the right path', () => {
  it('scrollable: one keyboard-aware scroll view', () => {
    Platform.OS = 'ios';
    const r = render(<Screen><Text>body</Text></Screen>);
    expect(r.UNSAFE_getAllByType(ScrollView)).toHaveLength(1);
    expect(r.UNSAFE_getByType(ScrollView).props.bottomOffset).toBe(24);
  });

  it('scrollable={false}: NO ScrollView at all, so a FlatList child is never nested in one', () => {
    Platform.OS = 'ios';
    const r = render(<Screen scrollable={false}><View testID="own-list" /></Screen>);
    expect(r.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
    expect(r.getByTestId('own-list')).toBeTruthy();
  });

  it('forwards scrollRef to the scroll view (the Discover "+" tile scrolls the page through it)', () => {
    Platform.OS = 'ios';
    const ref = React.createRef<ScrollView>();
    render(<Screen scrollRef={ref}><Text>body</Text></Screen>);
    expect(ref.current).toBeTruthy();
  });
});

describe('KeyboardSafeView', () => {
  it('renders its children on every platform', () => {
    for (const os of ['ios', 'android', 'web'] as const) {
      Platform.OS = os as never;
      const r = render(<KeyboardSafeView testID="v"><Text>kid</Text></KeyboardSafeView>);
      expect(r.getByText('kid')).toBeTruthy();
    }
  });
});

describe('wiring', () => {
  it('the root mounts KeyboardProvider around the app', () => {
    const src = read('app/_layout.tsx');
    expect(src).toMatch(/import \{ KeyboardProvider \} from 'react-native-keyboard-controller'/);
    expect(src).toMatch(/<KeyboardProvider>[\s\S]*<AppShell \/>[\s\S]*<\/KeyboardProvider>/);
  });

  it('the library is imported only by the wrapper and the root provider', () => {
    const importers = [
      'components/KeyboardSafeForm.tsx', 'app/_layout.tsx',
    ];
    for (const f of importers) expect(read(f)).toMatch(/react-native-keyboard-controller/);
    for (const f of [
      'components/layout/Screen.tsx', 'features/admin/ui/AdminPage.tsx', 'components/ui/BottomSheet.tsx',
      'features/chat/screens/ChatRoomScreen.tsx', 'features/chat/components/CommunityManageModal.tsx',
      'features/chat/components/candidates/PriceChangeSheet.tsx', 'features/communityAdmin/CommunityAdminScreen.tsx',
    ]) expect(read(f)).not.toMatch(/react-native-keyboard-controller/);
  });

  it('the iOS-only automaticallyAdjustKeyboardInsets is gone where the wrapper replaced it', () => {
    for (const f of [
      'features/chat/screens/ChatRoomScreen.tsx', 'features/chat/components/candidates/PriceChangeSheet.tsx',
    ]) expect(read(f)).not.toMatch(/automaticallyAdjustKeyboardInsets/);
  });

  it('keeps the Phase A chat list props', () => {
    const src = read('features/chat/screens/ChatRoomScreen.tsx');
    expect(src).toMatch(/keyboardShouldPersistTaps="handled"\n\s+\/\/ Drag the list down/);
    expect(src).toMatch(/keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
  });

  it('the chat composer is lifted by the keyboard, and listens to the events Android actually fires', () => {
    const src = read('features/chat/screens/ChatRoomScreen.tsx');
    expect(src).toMatch(/<KeyboardSafeView style=\{styles\.flex\}>/);
    expect(src).toMatch(/'keyboardDidShow', 'keyboardDidHide'/);
  });

  it('the Modals that hold inputs draw edge to edge on Android', () => {
    expect(KEYBOARD_MODAL_PROPS).toEqual({ statusBarTranslucent: true, navigationBarTranslucent: true });
    for (const f of [
      'components/ui/BottomSheet.tsx', 'features/chat/components/CommunityManageModal.tsx',
      'features/chat/components/candidates/PriceChangeSheet.tsx',
    ]) expect(read(f)).toMatch(/KEYBOARD_MODAL_PROPS/);
  });
});

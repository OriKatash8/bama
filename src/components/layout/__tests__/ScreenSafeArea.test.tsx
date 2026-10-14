import React from 'react';
import { Platform, SafeAreaView as RNSafeAreaView, StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Screen, type ScreenEdge } from '../Screen';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));

const realOS = Platform.OS;
afterEach(() => { (Platform as { OS: string }).OS = realOS; });

const SYSTEM = { top: 47, right: 3, bottom: 34, left: 5 };

function renderScreen(os: 'android' | 'ios' | 'web', opts: { insets?: typeof SYSTEM | null; edges?: ScreenEdge[] } = {}) {
  (Platform as { OS: string }).OS = os;
  const insets = opts.insets === undefined ? SYSTEM : opts.insets;
  return render(
    <SafeAreaInsetsContext.Provider value={insets}>
      <Screen edges={opts.edges}><Text>x</Text></Screen>
    </SafeAreaInsetsContext.Provider>,
  );
}

/** The padding of the view that wraps the Screen's body (the parent of the content's KeyboardAvoidingView). */
function androidPadding(r: ReturnType<typeof renderScreen>) {
  const body = r.getByText('x').parent!;
  let node: typeof body | null = body;
  while (node) {
    const st = StyleSheet.flatten(node.props.style) as Record<string, number> | undefined;
    if (st && ('paddingTop' in st || 'paddingBottom' in st) && st.flex === 1) return st;
    node = node.parent;
  }
  throw new Error('no padded wrapper');
}

describe('Screen on Android', () => {
  it('pads by the system insets from the safe-area context, on all four sides', () => {
    expect(androidPadding(renderScreen('android'))).toMatchObject({
      paddingTop: 47, paddingRight: 3, paddingBottom: 34, paddingLeft: 5,
    });
  });

  it('adds nothing at the top and bottom under the tab layouts, which zero them for the header and the docked bar', () => {
    const st = androidPadding(renderScreen('android', { insets: { ...SYSTEM, top: 0, bottom: 0 } }));
    expect(st.paddingTop).toBe(0);
    expect(st.paddingBottom).toBe(0);
    expect(st.paddingLeft).toBe(5);
  });

  it('honours an explicit edges list', () => {
    const st = androidPadding(renderScreen('android', { edges: ['top'] }));
    expect(st).toMatchObject({ paddingTop: 47, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 });
  });

  it('pads nothing without a provider instead of crashing', () => {
    expect(androidPadding(renderScreen('android', { insets: null }))).toMatchObject({ paddingTop: 0, paddingBottom: 0 });
  });

  it('never renders React Native\'s SafeAreaView', () => {
    expect(renderScreen('android').UNSAFE_queryAllByType(RNSafeAreaView)).toHaveLength(0);
  });
});

it.each(['ios', 'web'] as const)('%s keeps React Native\'s SafeAreaView and ignores the context', (os) => {
  const r = renderScreen(os);
  expect(r.UNSAFE_queryAllByType(RNSafeAreaView)).toHaveLength(1);
});

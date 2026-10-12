import React from 'react';
import { Platform, SafeAreaView as RNSafeAreaView, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { Screen } from '../Screen';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => {
  const { View: V } = require('react-native');
  return { SafeAreaView: (props: object) => <V testID="lib-safe-area" {...props} /> };
});

const realOS = Platform.OS;
afterEach(() => { (Platform as { OS: string }).OS = realOS; });

function renderScreen(os: 'android' | 'ios' | 'web') {
  (Platform as { OS: string }).OS = os;
  return render(<Screen><Text>x</Text></Screen>);
}

it('Android uses the safe-area-context view with all four edges', () => {
  const r = renderScreen('android');
  const v = r.getByTestId('lib-safe-area');
  expect(v.props.edges).toEqual(['top', 'right', 'bottom', 'left']);
  expect(r.UNSAFE_queryAllByType(RNSafeAreaView)).toHaveLength(0);
});

it.each(['ios', 'web'] as const)('%s keeps React Native\'s SafeAreaView and never the library one', (os) => {
  const r = renderScreen(os);
  expect(r.queryByTestId('lib-safe-area')).toBeNull();
  expect(r.UNSAFE_queryAllByType(RNSafeAreaView)).toHaveLength(1);
});

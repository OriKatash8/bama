import React from 'react';
import { ScrollView, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { Screen } from '../Screen';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));

const scroll = (r: ReturnType<typeof render>) => r.UNSAFE_getByType(ScrollView).props;

it('scrolls and bounces by default', () => {
  const p = scroll(render(<Screen><Text>x</Text></Screen>));
  expect(p.scrollEnabled).toBe(true);
  expect(p.bounces).toBe(true);
});

it('scrollEnabled={false} locks the page: no scroll, no bounce', () => {
  const p = scroll(render(<Screen scrollEnabled={false}><Text>x</Text></Screen>));
  expect(p.scrollEnabled).toBe(false);
  expect(p.bounces).toBe(false);
});

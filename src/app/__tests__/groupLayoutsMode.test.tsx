import React from 'react';
import { render, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ClientLayout from '../(client)/_layout';
import ProfessionalLayout from '../(professional)/_layout';
import { useAuthStore } from '@core/stores/authStore';

/**
 * A deep link or a web reload can open straight into a mode group, past the
 * root. The group then waits for auth to load (so the restored mode is known),
 * and if there is still no mode, the group itself is the mode — never "none".
 */

const mockRedirects: string[] = [];
jest.mock('expo-router', () => ({
  Stack: () => null,
  Redirect: ({ href }: { href: string }) => { mockRedirects.push(href); return null; },
  usePathname: () => '/chat/c1',
}));
jest.mock('@features/auth/hooks/usePhoneGate', () => ({ usePhoneGate: () => false }));
jest.mock('@core/firebase/firestore', () => ({ subscribeToDocument: jest.fn(() => () => {}) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const signedIn = { user: { id: 'u1', termsVersion: '1.0' } as never, needsEmailVerification: false, clientOnboarded: true, proProfileCompleted: true };

beforeEach(async () => {
  mockRedirects.length = 0;
  await AsyncStorage.clear();
});

describe.each([
  ['client', ClientLayout],
  ['professional', ProfessionalLayout],
] as const)('%s group', (mode, Layout) => {
  it('while auth is still loading → a loading screen, no redirect', () => {
    useAuthStore.setState({ ...signedIn, isLoading: true, activeMode: null });
    const r = render(<Layout />);
    expect(r.getByTestId('gate-pending')).toBeTruthy();
    expect(mockRedirects).toEqual([]);
  });

  it('loaded with no mode → takes the group\'s mode and saves it', async () => {
    useAuthStore.setState({ ...signedIn, isLoading: false, activeMode: null });
    render(<Layout />);
    await act(async () => {});
    expect(useAuthStore.getState().activeMode).toBe(mode);
    expect(await AsyncStorage.getItem('bama:lastMode:u1')).toBe(mode);
  });

  it('signed out → leaves the mode alone', async () => {
    useAuthStore.setState({ ...signedIn, user: null, isLoading: false, activeMode: null });
    render(<Layout />);
    await act(async () => {});
    expect(useAuthStore.getState().activeMode).toBeNull();
  });

  it('a mode already set is kept', async () => {
    const other = mode === 'client' ? 'professional' : 'client';
    useAuthStore.setState({ ...signedIn, isLoading: false, activeMode: other });
    render(<Layout />);
    await act(async () => {});
    expect(useAuthStore.getState().activeMode).toBe(other);
  });
});

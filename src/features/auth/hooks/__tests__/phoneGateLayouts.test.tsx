import React from 'react';
import { render } from '@testing-library/react-native';
import ClientLayout from '../../../../app/(client)/_layout';
import ProfessionalLayout from '../../../../app/(professional)/_layout';
import { useAuthStore } from '@core/stores/authStore';

/**
 * The phone number is optional (App Store 5.1.1(v)): neither app sends a user
 * without one anywhere. The other rungs — email verification, the client
 * onboarding, the pro profile lock — work as before.
 */

const mockRedirects: string[] = [];
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({
  Stack: () => null,
  Redirect: ({ href }: { href: string }) => { mockRedirects.push(href); return null; },
  usePathname: () => '/(client)/(tabs)/browse',
}));
let mockNeedsPhone = false;
jest.mock('@features/auth/hooks/usePhoneOnFile', () => ({ usePhoneOnFile: () => !mockNeedsPhone }));
jest.mock('@core/firebase/firestore', () => ({ subscribeToDocument: jest.fn(() => () => {}) }));

beforeEach(() => { mockRedirects.length = 0; mockNeedsPhone = false; useAuthStore.setState({ needsEmailVerification: null, isLoading: false }); });

it('professional with no phone number: only the profile lock applies, never the phone screen', () => {
  useAuthStore.setState({ user: { id: 'u1', termsVersion: '1.5' } as never, activeMode: 'professional', needsEmailVerification: false, proProfileCompleted: false });
  mockNeedsPhone = true;
  render(<ProfessionalLayout />);
  expect(mockRedirects.some((h) => h.includes('/settings/phone'))).toBe(false);
});

it('client not yet onboarded with no phone number: goes to onboarding', () => {
  useAuthStore.setState({ user: { id: 'u1', termsVersion: '1.5' } as never, activeMode: 'client', needsEmailVerification: false, clientOnboarded: false });
  mockNeedsPhone = true;
  render(<ClientLayout />);
  expect(mockRedirects).toEqual(['/(client)/onboarding']);
});

describe.each([
  ['client', ClientLayout, { clientOnboarded: false }],
  ['professional', ProfessionalLayout, { proProfileCompleted: false }],
] as const)('%s app', (mode, Layout, lockedOnboarding) => {
  it('a user with no phone number who is past onboarding goes straight in', () => {
    useAuthStore.setState({ user: { id: 'u1', termsVersion: '1.5' } as never, activeMode: mode, needsEmailVerification: false, clientOnboarded: true, proProfileCompleted: true });
    mockNeedsPhone = true;
    render(<Layout />);
    expect(mockRedirects).toEqual([]);
  });

  it('sends an unverified password account to verify its email — before onboarding', () => {
    useAuthStore.setState({ user: { id: 'u1', termsVersion: '1.5' } as never, activeMode: mode, needsEmailVerification: true, ...lockedOnboarding });
    mockNeedsPhone = true;
    render(<Layout />);
    expect(mockRedirects).toEqual(['/(auth)/verify-email']);
  });

  it('while verification is still unknown, shows a loading screen — never the app, never a redirect', () => {
    useAuthStore.setState({ user: { id: 'u1', termsVersion: '1.5' } as never, activeMode: mode, needsEmailVerification: null, clientOnboarded: true, proProfileCompleted: true });
    const r = render(<Layout />);
    expect(r.getByTestId('gate-pending')).toBeTruthy();
    expect(mockRedirects).toEqual([]);
  });

  it('leaves a user with a number alone', () => {
    useAuthStore.setState({ user: { id: 'u1', termsVersion: '1.5' } as never, activeMode: mode, needsEmailVerification: false, clientOnboarded: true, proProfileCompleted: true });
    render(<Layout />);
    expect(mockRedirects).toEqual([]);
  });
});

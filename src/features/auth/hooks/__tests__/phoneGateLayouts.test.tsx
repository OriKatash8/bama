import React from 'react';
import { render } from '@testing-library/react-native';
import ClientLayout from '../../../../app/(client)/_layout';
import ProfessionalLayout from '../../../../app/(professional)/_layout';
import { useAuthStore } from '@core/stores/authStore';

/**
 * Both apps send a signed-in user with no phone number to enter one, before
 * anything else — including the client onboarding and the pro profile lock,
 * which would otherwise redirect first.
 */

const mockRedirects: string[] = [];
jest.mock('expo-router', () => ({
  Stack: () => null,
  Redirect: ({ href }: { href: string }) => { mockRedirects.push(href); return null; },
  usePathname: () => '/(client)/(tabs)/browse',
}));
let mockNeedsPhone = false;
jest.mock('@features/auth/hooks/usePhoneGate', () => ({ usePhoneGate: () => mockNeedsPhone }));
jest.mock('@core/firebase/firestore', () => ({ subscribeToDocument: jest.fn(() => () => {}) }));

beforeEach(() => { mockRedirects.length = 0; mockNeedsPhone = false; useAuthStore.setState({ needsEmailVerification: null }); });

describe.each([
  ['client', ClientLayout, { clientOnboarded: false }],
  ['professional', ProfessionalLayout, { proProfileCompleted: false }],
] as const)('%s app', (mode, Layout, lockedOnboarding) => {
  it('sends a user with no phone number to enter one — ahead of onboarding', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, activeMode: mode, needsEmailVerification: false, ...lockedOnboarding });
    mockNeedsPhone = true;
    render(<Layout />);
    expect(mockRedirects).toEqual(['/settings/phone?required=1']);
  });

  it('sends an unverified password account to verify its email — before the phone and onboarding', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, activeMode: mode, needsEmailVerification: true, ...lockedOnboarding });
    mockNeedsPhone = true;
    render(<Layout />);
    expect(mockRedirects).toEqual(['/(auth)/verify-email']);
  });

  it('while verification is still unknown, shows a loading screen — never the app, never a redirect', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, activeMode: mode, needsEmailVerification: null, clientOnboarded: true, proProfileCompleted: true });
    const r = render(<Layout />);
    expect(r.getByTestId('gate-pending')).toBeTruthy();
    expect(mockRedirects).toEqual([]);
  });

  it('leaves a user with a number alone', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, activeMode: mode, needsEmailVerification: false, clientOnboarded: true, proProfileCompleted: true });
    render(<Layout />);
    expect(mockRedirects).toEqual([]);
  });
});

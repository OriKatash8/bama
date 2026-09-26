import React from 'react';
import { Text } from 'react-native';
import { renderRouter, act, screen } from 'expo-router/testing-library';
import { Slot, router } from 'expo-router';
import ClientLayout from '../../../../app/(client)/_layout';
import ProfessionalLayout from '../../../../app/(professional)/_layout';
import { useAuthStore } from '@core/stores/authStore';

/**
 * A GOOGLE / APPLE SIGN-UP MUST ADD A PHONE NUMBER TOO.
 *
 * They never see the registration form: useGoogleSignIn / useAppleSignIn run
 * syncUser and replace to /(auth)/mode-select, and switchMode sends them into
 * one of the two apps. Driven here through a real router with the REAL layouts
 * and the REAL gate (usePhoneGate); only the private contact doc is stubbed, as
 * it is for a new social account — it does not exist.
 */

let mockPhone: string | null = null;
jest.mock('@features/auth/services/phoneService', () => ({
  subscribePhone: (_uid: string, cb: (p: string | null) => void) => { cb(mockPhone); return () => {}; },
}));
jest.mock('@core/firebase/firestore', () => ({
  // Onboarding and the pro profile are done: only the phone can hold them back.
  subscribeToDocument: (path: string, cb: (d: unknown) => void) => {
    cb(path.endsWith('/profile/data') ? { proProfileCompleted: true } : { clientOnboarded: true });
    return () => {};
  },
}));

const routes = {
  _layout: () => <Slot />,
  '(auth)/mode-select': () => <Text>MODE-SELECT</Text>,
  '(client)/_layout': ClientLayout,
  '(client)/(tabs)/home': () => <Text>CLIENT-HOME</Text>,
  '(professional)/_layout': ProfessionalLayout,
  '(professional)/(tabs)/dashboard': () => <Text>PRO-DASHBOARD</Text>,
  'settings/phone': () => <Text>PHONE-SCREEN</Text>,
};

beforeEach(() => { mockPhone = null; });

describe.each([
  ['client', '/(client)/(tabs)/home', 'CLIENT-HOME'],
  ['professional', '/(professional)/(tabs)/dashboard', 'PRO-DASHBOARD'],
] as const)('a new social account choosing %s', (mode, home, homeText) => {
  it('is sent to add a phone number instead of the app', () => {
    useAuthStore.setState({ user: { id: 'google-user' } as never, activeMode: mode, hasPhone: null, needsEmailVerification: false }); // a Google account: exempt
    renderRouter(routes, { initialUrl: '/(auth)/mode-select' });

    act(() => { router.replace(home); }); // what switchMode does

    expect(screen.getByText('PHONE-SCREEN')).toBeTruthy();
    expect(screen.queryByText(homeText)).toBeNull();
  });

  it('once they have one, goes straight in', () => {
    mockPhone = '+972501234567';
    useAuthStore.setState({ user: { id: 'google-user' } as never, activeMode: mode, hasPhone: null, needsEmailVerification: false }); // a Google account: exempt
    renderRouter(routes, { initialUrl: '/(auth)/mode-select' });

    act(() => { router.replace(home); });

    expect(screen.getByText(homeText)).toBeTruthy();
  });
});

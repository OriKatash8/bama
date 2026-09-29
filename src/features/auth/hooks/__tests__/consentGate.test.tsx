import React from 'react';
import { render, renderHook } from '@testing-library/react-native';
import { useOnboardingGate } from '../useOnboardingGate';
import Index from '../../../../app/index';
import { useAuthStore } from '@core/stores/authStore';
import { useLaunchIntentStore } from '@core/stores/launchIntentStore';
import { CURRENT_TERMS_VERSION } from '@core/constants/legal';

/**
 * THE RE-ACCEPT GATE. A signed-in user whose termsVersion is missing or older
 * than CURRENT_TERMS_VERSION sees the consent screen before anything else —
 * before email verification, the phone number, mode select or the app.
 */

let mockNeedsPhone = false;
jest.mock('@features/auth/hooks/usePhoneGate', () => ({ usePhoneGate: () => mockNeedsPhone }));
const mockRedirects: string[] = [];
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => { mockRedirects.push(href); return null; },
}));

const gate = () => renderHook(() => useOnboardingGate()).result.current;

beforeEach(() => {
  mockNeedsPhone = false;
  mockRedirects.length = 0;
  useLaunchIntentStore.setState({ checked: true, hasPending: false });
  useAuthStore.setState({ user: null, needsEmailVerification: false, isLoading: false, activeMode: 'client' });
});

describe('the layouts\' gate', () => {
  it('sends a user with no termsVersion to the consent screen', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    expect(gate()).toBe('/(auth)/consent');
  });

  it('sends a user on an outdated termsVersion to the consent screen', () => {
    useAuthStore.setState({ user: { id: 'u1', termsVersion: '0.9' } as never });
    expect(gate()).toBe('/(auth)/consent');
  });

  it('consent comes before email verification and the phone number', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, needsEmailVerification: true });
    mockNeedsPhone = true;
    expect(gate()).toBe('/(auth)/consent');
  });

  it('a user on the current version is not stopped by it', () => {
    useAuthStore.setState({ user: { id: 'u1', termsVersion: CURRENT_TERMS_VERSION } as never });
    expect(gate()).toBeNull();
  });
});

describe('the root', () => {
  it('sends an outdated signed-in user to the consent screen, not into the app', () => {
    useAuthStore.setState({ user: { id: 'u1', termsVersion: '0.9' } as never });
    render(<Index />);
    expect(mockRedirects).toEqual(['/(auth)/consent']);
  });

  it('a user on the current version goes in as before', () => {
    useAuthStore.setState({ user: { id: 'u1', termsVersion: CURRENT_TERMS_VERSION } as never });
    render(<Index />);
    expect(mockRedirects).toEqual(['/(client)/(tabs)/home']);
  });
});

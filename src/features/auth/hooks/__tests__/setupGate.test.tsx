import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, renderHook } from '@testing-library/react-native';
import { useOnboardingGate } from '../useOnboardingGate';
import Index from '../../../../app/index';
import { useAuthStore } from '@core/stores/authStore';

/**
 * FIRST-TIME SETUP COMES BEFORE MODE SELECT.
 * A new account — email verified, consent given — goes to the name / picture
 * (/ phone) page first, and only then chooses client or professional. Order:
 * consent → email verification → setup → mode select → the app.
 */

let mockNeedsPhone = false;
jest.mock('@features/auth/hooks/usePhoneGate', () => ({ usePhoneGate: () => mockNeedsPhone }));
const mockRedirects: string[] = [];
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => { mockRedirects.push(href); return null; },
}));

const NEW = { id: 'u1', termsVersion: '1.0', needsProfileSetup: true };

beforeEach(() => {
  mockNeedsPhone = false;
  mockRedirects.length = 0;
  useAuthStore.setState({ user: null, needsEmailVerification: false, isLoading: false, activeMode: null });
});

describe('the root', () => {
  it('a new account with its email verified goes to setup, not mode select', () => {
    useAuthStore.setState({ user: NEW as never });
    render(<Index />);
    expect(mockRedirects).toEqual(['/(auth)/setup']);
  });

  it('verifying the email still comes first', () => {
    useAuthStore.setState({ user: NEW as never, needsEmailVerification: true });
    render(<Index />);
    expect(mockRedirects).toEqual(['/(auth)/verify-email']);
  });

  it('setup done: mode select, as before', () => {
    useAuthStore.setState({ user: { ...NEW, needsProfileSetup: false } as never });
    render(<Index />);
    expect(mockRedirects).toEqual(['/(auth)/mode-select']);
  });
});

describe('the layouts\' gate', () => {
  it('sends a new account to setup after email, before the phone number', () => {
    useAuthStore.setState({ user: NEW as never });
    mockNeedsPhone = true;
    expect(renderHook(() => useOnboardingGate()).result.current).toBe('/(auth)/setup');
  });
  it('an existing account is not sent there', () => {
    useAuthStore.setState({ user: { id: 'u1', termsVersion: '1.0' } as never });
    expect(renderHook(() => useOnboardingGate()).result.current).toBeNull();
  });
});

it('mode select sends a new account to setup first', () => {
  const src = readFileSync(join(__dirname, '..', '..', '..', '..', 'app', '(auth)', 'mode-select.tsx'), 'utf8');
  expect(src).toMatch(/needsProfileSetup\(st\.user\)/);
  expect(src).toMatch(/<Redirect href=\{'\/\(auth\)\/setup' as never\} \/>/);
});

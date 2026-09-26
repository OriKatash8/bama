import React from 'react';
import { render } from '@testing-library/react-native';
import Index from '../index';
import { useAuthStore } from '@core/stores/authStore';

/**
 * The root sends a signed-in, unverified password account to verify its email
 * before anything else — not to mode-select, where it would only be gated again.
 */

const mockRedirects: string[] = [];
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => { mockRedirects.push(href); return null; },
}));

beforeEach(() => { mockRedirects.length = 0; });

it('unverified password account → verify email, even with no mode chosen yet', () => {
  useAuthStore.setState({ user: { id: 'u1' } as never, isLoading: false, activeMode: null, needsEmailVerification: true });
  render(<Index />);
  expect(mockRedirects).toEqual(['/(auth)/verify-email']);
});

it('verified (or exempt) → carries on as before', () => {
  useAuthStore.setState({ user: { id: 'u1' } as never, isLoading: false, activeMode: null, needsEmailVerification: false });
  render(<Index />);
  expect(mockRedirects).toEqual(['/(auth)/mode-select']);
});

it('signed out → the auth stack', () => {
  useAuthStore.setState({ user: null, isLoading: false, activeMode: null, needsEmailVerification: null });
  render(<Index />);
  expect(mockRedirects).toEqual(['/(auth)']);
});

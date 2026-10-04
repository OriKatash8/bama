import React from 'react';
import { render } from '@testing-library/react-native';
import Index, { resetLaunchRouted } from '../index';
import { useAuthStore } from '@core/stores/authStore';
import { useLaunchIntentStore } from '@core/stores/launchIntentStore';

/**
 * A relaunch opens on mode-select (first visit only), then the saved mode's home — unless the app was opened by
 * tapping a notification, in which case the notification's target wins and
 * the root must not redirect over it.
 */

const mockRedirects: string[] = [];
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => { mockRedirects.push(href); return null; },
}));

const signedIn = { user: { id: 'u1', termsVersion: '1.4' } as never, isLoading: false, needsEmailVerification: false, proProfileCompleted: null };

beforeEach(() => {
  mockRedirects.length = 0;
  resetLaunchRouted();
  useLaunchIntentStore.setState({ checked: true, hasPending: false });
});

it('first launch with a restored mode → mode-select, not the home', () => {
  useAuthStore.setState({ ...signedIn, activeMode: 'client' });
  render(<Index />);
  expect(mockRedirects).toEqual(['/(auth)/mode-select']);
});

it('a later visit to the root (after launch) → the mode home, no bounce to the picker', () => {
  useAuthStore.setState({ ...signedIn, activeMode: 'client' });
  render(<Index />).unmount();
  mockRedirects.length = 0;
  render(<Index />);
  expect(mockRedirects).toEqual(['/(client)/(tabs)/home']);
});

it('restored pro with a completed profile → the noticeboard', () => {
  useAuthStore.setState({ ...signedIn, activeMode: 'professional', proProfileCompleted: true });
  render(<Index />).unmount(); mockRedirects.length = 0; render(<Index />);
  expect(mockRedirects).toEqual(['/(professional)/(tabs)/dashboard']);
});

it('restored pro with an incomplete profile → the forced profile screen', () => {
  useAuthStore.setState({ ...signedIn, activeMode: 'professional', proProfileCompleted: false });
  render(<Index />).unmount(); mockRedirects.length = 0; render(<Index />);
  expect(mockRedirects).toEqual(['/(professional)/(tabs)/profile']);
});

it('no saved mode → mode-select', () => {
  useAuthStore.setState({ ...signedIn, activeMode: null });
  render(<Index />);
  expect(mockRedirects).toEqual(['/(auth)/mode-select']);
});

it('the launch notification has not been checked yet → a loading screen, no redirect', () => {
  useLaunchIntentStore.setState({ checked: false, hasPending: false });
  useAuthStore.setState({ ...signedIn, activeMode: 'client' });
  const r = render(<Index />);
  expect(r.UNSAFE_queryByType(require('react-native').ActivityIndicator)).toBeTruthy();
  expect(mockRedirects).toEqual([]);
});

it('opened from a notification tap → no redirect to home; the notification routes', () => {
  useLaunchIntentStore.setState({ checked: true, hasPending: true });
  useAuthStore.setState({ ...signedIn, activeMode: 'client' });
  render(<Index />);
  expect(mockRedirects).toEqual([]);
});

it('opened from a notification tap but a gate is due → the gate still comes first', () => {
  useLaunchIntentStore.setState({ checked: true, hasPending: true });
  useAuthStore.setState({ ...signedIn, user: { id: 'u1', termsVersion: '0.9' } as never, activeMode: 'client' });
  render(<Index />);
  expect(mockRedirects).toEqual(['/(auth)/consent']);
});

it('opened from a notification tap with no saved mode → mode-select, as before', () => {
  useLaunchIntentStore.setState({ checked: true, hasPending: true });
  useAuthStore.setState({ ...signedIn, activeMode: null });
  render(<Index />);
  expect(mockRedirects).toEqual(['/(auth)/mode-select']);
});

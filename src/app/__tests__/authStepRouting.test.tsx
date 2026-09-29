import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';
import { Redirect, router } from 'expo-router';
import { renderRouter, screen, act } from 'expo-router/testing-library';
import { useAuthStore } from '@core/stores/authStore';
import { nextAuthRoute } from '@features/auth/utils/nextAuthRoute';

/**
 * A JUST-VERIFIED USER MUST NOT LAND ON LOGIN.
 * Route groups are not part of a URL, so the login screen, (auth)/index, is
 * also "/". From inside the (auth) stack, replace('/') resolved to login rather
 * than the root that decides where to go. The (auth) screens now navigate to
 * nextAuthRoute directly.
 */

const shown = () => JSON.stringify(screen.toJSON()).match(/LOGIN|VERIFY|SETUP|MODE/g)?.pop();
function Verify() { return <Text>VERIFY</Text>; }
function Root() { return <Redirect href={nextAuthRoute(useAuthStore.getState()) as never} />; }

function renderAuthStack() {
  renderRouter({
    index: Root,
    '(auth)/_layout': require('expo-router').Stack,
    '(auth)/index': () => <Text>LOGIN</Text>,
    '(auth)/verify-email': Verify,
    '(auth)/setup': () => <Text>SETUP</Text>,
    '(auth)/mode-select': () => <Text>MODE</Text>,
  }, { initialUrl: '/(auth)/verify-email' });
}

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'u', termsVersion: '1.0', needsProfileSetup: true } as never,
    needsEmailVerification: true,
    activeMode: null,
  });
});

it('the trap itself: replace("/") from the verify screen shows login', async () => {
  renderAuthStack();
  expect(shown()).toBe('VERIFY');
  await act(async () => { useAuthStore.setState({ needsEmailVerification: false }); router.replace('/'); });
  expect(shown()).toBe('LOGIN');
});

it('verified: straight to the name / picture page', async () => {
  renderAuthStack();
  await act(async () => {
    useAuthStore.setState({ needsEmailVerification: false });
    router.replace(nextAuthRoute(useAuthStore.getState()) as never);
  });
  expect(shown()).toBe('SETUP');
});

it('the order: consent → email → setup → mode select → the app', () => {
  const u = { id: 'u', termsVersion: '1.0' } as never;
  const s = (o: object) => nextAuthRoute({ user: u, needsEmailVerification: false, activeMode: null, ...o });
  expect(s({ user: null })).toBe('/(auth)');
  expect(s({ user: { id: 'u', needsProfileSetup: true } })).toBe('/(auth)/consent');
  expect(s({ user: { id: 'u', termsVersion: '1.0', needsProfileSetup: true }, needsEmailVerification: true })).toBe('/(auth)/verify-email');
  expect(s({ user: { id: 'u', termsVersion: '1.0', needsProfileSetup: true } })).toBe('/(auth)/setup');
  expect(s({})).toBe('/(auth)/mode-select');
  expect(s({ activeMode: 'client' })).toBe('/(client)/(tabs)/home');
  expect(s({ activeMode: 'professional' })).toBe('/(professional)/(tabs)/dashboard');
});

// A relaunch restores the last mode; the root then sends it to that mode's home.
// An incomplete pro goes to the forced profile screen; "unknown" (the read timed
// out or failed) goes to the noticeboard and the pro layout's lock takes over.
it('a restored mode: client → home, pro → noticeboard, incomplete pro → profile', () => {
  const u = { id: 'u', termsVersion: '1.0' } as never;
  const s = (o: object) => nextAuthRoute({ user: u, needsEmailVerification: false, activeMode: null, ...o });
  expect(s({ activeMode: 'client', proProfileCompleted: false })).toBe('/(client)/(tabs)/home');
  expect(s({ activeMode: 'professional', proProfileCompleted: true })).toBe('/(professional)/(tabs)/dashboard');
  expect(s({ activeMode: 'professional', proProfileCompleted: false })).toBe('/(professional)/(tabs)/profile');
  expect(s({ activeMode: 'professional', proProfileCompleted: null })).toBe('/(professional)/(tabs)/dashboard');
  // The terms gate still comes first, whatever mode was saved.
  expect(s({ user: { id: 'u', termsVersion: '0.9' }, activeMode: 'professional', proProfileCompleted: true })).toBe('/(auth)/consent');
});

it.each([
  'features/auth/components/VerifyEmailForm.tsx',
  'features/auth/components/ConsentForm.tsx',
  'app/(auth)/setup.tsx',
])('%s never sends anyone to "/" (that is login, from inside (auth))', (file) => {
  const src = readFileSync(join(__dirname, '..', '..', file), 'utf8');
  expect(src).not.toMatch(/replace\('\/'\)/);
  expect(src).toMatch(/nextAuthRoute\(/);
});

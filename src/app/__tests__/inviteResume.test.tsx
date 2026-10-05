import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { act, render, renderHook } from '@testing-library/react-native';
import InviteRoute from '../c/[token]';
import { useAuthStore } from '@core/stores/authStore';
import { usePendingIntentStore } from '@core/stores/pendingIntentStore';
import { nextAuthRoute } from '@features/auth/utils/nextAuthRoute';
import { postStepRoute } from '@features/auth/utils/postStepRoute';
import { useOnboardingGate } from '@features/auth/hooks/useOnboardingGate';
import { useSwitchMode } from '@features/auth/hooks/useSwitchMode';

/**
 * The invite link's round trip through sign-in. The risk this locks in: a link
 * opened while signed out must come back out the other end as the invite screen,
 * whichever way the user gets through consent / email / setup / mode-select.
 */

const TOKEN = 'T'.repeat(22);
const HREF = `/c/${TOKEN}`;

const mockRedirects: { href: string; resumeAtRender: string | null }[] = [];
const mockReplace = jest.fn();
let mockParams: { token?: string } = { token: TOKEN };
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  Redirect: ({ href }: { href: string }) => {
    // What was in the store at the moment the redirect rendered: the save must already be done.
    mockRedirects.push({ href, resumeAtRender: require('@core/stores/pendingIntentStore').usePendingIntentStore.getState().resume?.href ?? null });
    return null;
  },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));
let mockNeedsPhone = false;
jest.mock('@features/auth/hooks/usePhoneGate', () => ({ usePhoneGate: () => mockNeedsPhone }));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn(async () => null), subscribeToDocument: jest.fn(() => () => {}) }));
const mockPreview = jest.fn((_p: { tokenOrCode: string }) => null);
jest.mock('@features/communities/invites/InvitePreviewScreen', () => ({ InvitePreviewScreen: (p: { tokenOrCode: string }) => mockPreview(p) }));

const store = () => usePendingIntentStore.getState();
const CONSENTED = { id: 'u1', termsVersion: '1.4' } as never;

beforeAll(async () => { await usePendingIntentStore.persist.rehydrate(); });
beforeEach(() => {
  jest.clearAllMocks();
  mockRedirects.length = 0;
  mockParams = { token: TOKEN };
  mockNeedsPhone = false;
  usePendingIntentStore.setState({ resume: null, afterProfile: null, consumedAt: 0 });
  useAuthStore.setState({ user: null, isLoading: false, activeMode: null, needsEmailVerification: null });
});

describe('/c/[token] saves the link BEFORE any redirect', () => {
  it('signed out: the link is already stored when the redirect to login renders', async () => {
    render(<InviteRoute />);
    await act(async () => {});
    expect(mockRedirects.length).toBeGreaterThan(0);
    expect(mockRedirects.every((r) => r.href === '/(auth)')).toBe(true);
    // Every redirect that rendered saw the saved link: none fired ahead of the save.
    expect(mockRedirects.every((r) => r.resumeAtRender === HREF)).toBe(true);
  });

  it('signed in but owing consent: saved first, then sent to consent', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, needsEmailVerification: false });
    render(<InviteRoute />);
    await act(async () => {});
    expect(mockRedirects.map((r) => r.href)).toEqual(['/(auth)/consent']);
    expect(mockRedirects[0].resumeAtRender).toBe(HREF);
  });

  it('a signed-in, fully set-up user just sees the invite: no redirect, nothing saved', async () => {
    useAuthStore.setState({ user: CONSENTED, needsEmailVerification: false, activeMode: 'client' });
    render(<InviteRoute />);
    await act(async () => {});
    expect(mockRedirects).toEqual([]);
    expect(mockPreview).toHaveBeenCalledWith({ tokenOrCode: TOKEN });
    expect(store().resume).toBeNull();
  });

  it('waits while the email answer is unknown, without redirecting or saving', async () => {
    useAuthStore.setState({ user: CONSENTED, needsEmailVerification: null });
    const r = render(<InviteRoute />);
    await act(async () => {});
    expect(r.getByTestId('gate-pending')).toBeTruthy();
    expect(mockRedirects).toEqual([]);
  });

  it('a malformed link never reaches the backend and is never saved', async () => {
    mockParams = { token: '../admin' };
    useAuthStore.setState({ user: CONSENTED, needsEmailVerification: false });
    render(<InviteRoute />);
    await act(async () => {});
    expect(mockPreview).toHaveBeenCalledWith({ tokenOrCode: '' });
    expect(store().resume).toBeNull();
  });
});

describe('a. new signed-out user: the whole rung chain lands back on the invite', () => {
  const user = (o: object) => ({ id: 'u1', ...o }) as never;
  const state = (o: object) => ({ user: CONSENTED, needsEmailVerification: false, activeMode: null as 'client' | 'professional' | null, ...o });

  it('open link → login → consent → email → setup → mode-select → switchMode → /c/<token>', async () => {
    // 1. Cold open while signed out.
    render(<InviteRoute />);
    await act(async () => {});
    expect(store().resume?.href).toBe(HREF);

    // 2. Each step finishing sends the user to the NEXT auth screen and leaves the link alone.
    expect(await postStepRoute(state({ user: user({}) }) as never)).toBe('/(auth)/consent');
    expect(await postStepRoute(state({ user: user({ termsVersion: '1.4', needsProfileSetup: true }), needsEmailVerification: true }) as never)).toBe('/(auth)/verify-email');
    expect(await postStepRoute(state({ user: user({ termsVersion: '1.4', needsProfileSetup: true }) }) as never)).toBe('/(auth)/setup');
    // A brand-new account has no restored mode: its next stop is mode-select.
    expect(await postStepRoute(state({}) as never)).toBe('/(auth)/mode-select');
    expect(store().resume?.href).toBe(HREF); // still waiting for switchMode

    // 3. Mode-select → switchMode takes it.
    await act(async () => { useAuthStore.setState({ user: CONSENTED, activeMode: null }); });
    const { result } = renderHook(() => useSwitchMode());
    await act(async () => { await result.current.switchMode('client'); });
    expect(mockReplace).toHaveBeenCalledWith(HREF);
    expect(store().resume).toBeNull();
  });
});

describe('b. returning user, mode restored, mode-select skipped: still lands on the invite', () => {
  it.each(['client', 'professional'] as const)('%s: the step that skips mode-select returns /c/<token>, once', async (mode) => {
    store().saveResume(HREF);
    const s = { user: CONSENTED, needsEmailVerification: false, activeMode: mode, proProfileCompleted: true };
    // Without the fix this is the mode home: the link would be dropped.
    expect(await postStepRoute(s)).toBe(HREF);
    expect(store().resume).toBeNull();
    // Spent: the next call is the plain home.
    expect(await postStepRoute(s)).toBe(nextAuthRoute(s));
  });

  it('an incomplete pro still gets the invite, not the forced profile screen', async () => {
    store().saveResume(HREF);
    expect(await postStepRoute({ user: CONSENTED, needsEmailVerification: false, activeMode: 'professional', proProfileCompleted: false })).toBe(HREF);
  });

  it('does not consume the link while another auth step is still ahead', async () => {
    store().saveResume(HREF);
    expect(await postStepRoute({ user: { id: 'u1', termsVersion: '0.9' } as never, needsEmailVerification: false, activeMode: 'client' })).toBe('/(auth)/consent');
    expect(store().resume?.href).toBe(HREF);
  });
});

describe('c. returning user with NO saved link: the flow is exactly what it was', () => {
  const states = [
    { user: null, needsEmailVerification: null, activeMode: null },
    { user: { id: 'u' }, needsEmailVerification: false, activeMode: 'client' },
    { user: { id: 'u', termsVersion: '1.4', needsProfileSetup: true }, needsEmailVerification: true, activeMode: 'client' },
    { user: { id: 'u', termsVersion: '1.4', needsProfileSetup: true }, needsEmailVerification: false, activeMode: 'professional' },
    { user: CONSENTED, needsEmailVerification: false, activeMode: null },
    { user: CONSENTED, needsEmailVerification: false, activeMode: 'client' },
    { user: CONSENTED, needsEmailVerification: false, activeMode: 'professional', proProfileCompleted: true },
    { user: CONSENTED, needsEmailVerification: false, activeMode: 'professional', proProfileCompleted: false },
    { user: CONSENTED, needsEmailVerification: false, activeMode: 'professional', proProfileCompleted: null },
  ] as never[];

  it('postStepRoute === nextAuthRoute for every state', async () => {
    for (const s of states) expect(await postStepRoute(s)).toBe(nextAuthRoute(s));
  });

  it('a restored mode goes straight to its home (mode-select is NOT shown); no restored mode still gets mode-select', async () => {
    expect(await postStepRoute({ user: CONSENTED, needsEmailVerification: false, activeMode: 'client' })).toBe('/(client)/(tabs)/home');
    expect(await postStepRoute({ user: CONSENTED, needsEmailVerification: false, activeMode: 'professional', proProfileCompleted: true })).toBe('/(professional)/(tabs)/dashboard');
    expect(await postStepRoute({ user: CONSENTED, needsEmailVerification: false, activeMode: null })).toBe('/(auth)/mode-select');
  });

  it('switchMode with no saved link goes to the mode home as before', async () => {
    const { result } = renderHook(() => useSwitchMode());
    await act(async () => { await result.current.switchMode('client'); });
    expect(mockReplace).toHaveBeenCalledWith('/(client)/(tabs)/home');
  });

  it('the sign-in entry points still go to mode-select, untouched', () => {
    for (const f of ['features/auth/hooks/useLogin.ts', 'features/auth/hooks/useGoogleSignIn.ts', 'features/auth/hooks/useAppleSignIn.ts']) {
      const src = readFileSync(join(__dirname, '..', '..', f), 'utf8');
      expect(src).toMatch(/replace\('\/\(auth\)\/mode-select'\)/);
      expect(src).not.toMatch(/postStepRoute|pendingIntent/);
    }
  });
});

describe('no verified phone: the phone rung does not stand between consent and the invite', () => {
  it('after consent, with a link pending and no phone on file, the destination is /c/<token>, not the phone screen', async () => {
    mockNeedsPhone = true;
    store().saveResume(HREF);
    const to = await postStepRoute({ user: CONSENTED, needsEmailVerification: false, activeMode: 'client' });
    expect(to).toBe(HREF);
    expect(to).not.toContain('/settings/phone');
  });

  it('the invite route itself does not ask for the phone either', async () => {
    mockNeedsPhone = true;
    useAuthStore.setState({ user: CONSENTED, needsEmailVerification: false, activeMode: 'client' });
    render(<InviteRoute />);
    await act(async () => {});
    expect(mockRedirects).toEqual([]);
    expect(mockPreview).toHaveBeenCalled();
  });

  it('the gate skips the phone rung with deferPhone and not without it (the group layouts still ask)', () => {
    mockNeedsPhone = true;
    useAuthStore.setState({ user: CONSENTED, needsEmailVerification: false });
    expect(renderHook(() => useOnboardingGate({ deferPhone: true })).result.current).toBeNull();
    expect(renderHook(() => useOnboardingGate()).result.current).toBe('/settings/phone?required=1');
  });

  it('the route has no phone logic of its own', () => {
    const src = readFileSync(join(__dirname, '..', 'c', '[token].tsx'), 'utf8');
    expect(src).not.toMatch(/usePhoneGate/);
    expect(src).not.toMatch(/settings\/phone/);
    expect(src).toMatch(/deferPhone: true/);
  });
});

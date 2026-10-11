import { renderHook } from '@testing-library/react-native';
import { useOnboardingGate } from '../useOnboardingGate';
import { useAuthStore } from '@core/stores/authStore';

/**
 * ONE gate, in rungs, first failing rung wins:
 *   1. an unverified password account → verify the email
 *   (further rungs — forced pro profile — slot in below)
 * The phone number is optional (App Store 5.1.1(v)): no rung for it.
 * Unknown (null) never blocks.
 */

let mockNeedsPhone = false;
jest.mock('@features/auth/hooks/usePhoneOnFile', () => ({ usePhoneOnFile: () => !mockNeedsPhone }));

const gate = () => renderHook(() => useOnboardingGate()).result.current;

beforeEach(() => { mockNeedsPhone = false; useAuthStore.setState({ needsEmailVerification: null }); });

it('lets a finished account through', () => {
  useAuthStore.setState({ needsEmailVerification: false });
  expect(gate()).toBeNull();
});

it('sends an unverified password account to verify its email', () => {
  useAuthStore.setState({ needsEmailVerification: true });
  expect(gate()).toBe('/(auth)/verify-email');
});

it('an unverified account without a phone is sent to verify its email', () => {
  useAuthStore.setState({ needsEmailVerification: true });
  mockNeedsPhone = true;
  expect(gate()).toBe('/(auth)/verify-email');
});

it('a verified account without a phone goes straight in: the phone is optional', () => {
  useAuthStore.setState({ needsEmailVerification: false });
  mockNeedsPhone = true;
  expect(gate()).toBeNull();
});

it('signed out (loading done, no user) goes to login, before every other rung', () => {
  useAuthStore.setState({ isLoading: false, user: null, needsEmailVerification: true });
  mockNeedsPhone = true;
  expect(gate()).toBe('/(auth)');
});

it('still loading with no user yet does not redirect', () => {
  useAuthStore.setState({ isLoading: true, user: null });
  expect(gate()).toBeNull();
});

it('while verification is unknown, it does not block', () => {
  expect(gate()).toBeNull();
});

import { renderHook } from '@testing-library/react-native';
import { useOnboardingGate } from '../useOnboardingGate';
import { useAuthStore } from '@core/stores/authStore';

/**
 * ONE gate, in rungs, first failing rung wins:
 *   1. an unverified password account → verify the email
 *   2. no phone number                → add one
 *   (further rungs — phone verification, forced pro profile — slot in below)
 * Unknown (null) never blocks.
 */

let mockNeedsPhone = false;
jest.mock('@features/auth/hooks/usePhoneGate', () => ({ usePhoneGate: () => mockNeedsPhone }));

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

it('email comes before phone', () => {
  useAuthStore.setState({ needsEmailVerification: true });
  mockNeedsPhone = true;
  expect(gate()).toBe('/(auth)/verify-email');
});

it('a verified account without a phone is sent to add one', () => {
  useAuthStore.setState({ needsEmailVerification: false });
  mockNeedsPhone = true;
  expect(gate()).toBe('/settings/phone?required=1');
});

it('while verification is unknown, it does not block', () => {
  expect(gate()).toBeNull();
});

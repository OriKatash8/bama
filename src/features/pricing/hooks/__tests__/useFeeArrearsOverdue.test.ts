import { renderHook, act } from '@testing-library/react-native';
import { useFeeArrears } from '../useFeeArrears';

/**
 * The overdue half of useFeeArrears: the client mirror that decides whether the
 * banner shows and the offer dialog fires. Behind the kill switch, and on the
 * second the block starts.
 */

let mockConfig = { paymentFailureGraceDays: 7, feeOverdueBlockEnabled: true };
let mockEmit: ((m: Map<string, unknown>) => void) | null = null;

jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'pro-1' } }),
}));
jest.mock('../usePricingConfig', () => ({ usePricingConfig: () => mockConfig }));
jest.mock('../../services/feesService', () => ({
  listenToMyFees: (_uid: string, cb: (m: Map<string, unknown>) => void) => { mockEmit = cb; return () => {}; },
}));

const sec = (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });
const fee = (overdueAtMs: number, over: Record<string, unknown> = {}) => ({
  professionalId: 'pro-1', feeStatus: 'owed', status: 'pending', feePaid: false, feeDue: 45,
  engagementStatus: 'completed', overdueAt: sec(overdueAtMs), chargeDueAt: sec(overdueAtMs - 3 * 86400_000), ...over,
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(Date.UTC(2026, 9, 2, 12));
  mockConfig = { paymentFailureGraceDays: 7, feeOverdueBlockEnabled: true };
  mockEmit = null;
});
afterEach(() => jest.useRealTimers());

function emit(fees: Record<string, unknown>) {
  act(() => { mockEmit!(new Map(Object.entries(fees))); });
}

it('an overdue fee blocks, with its amount', () => {
  const { result } = renderHook(() => useFeeArrears());
  emit({ p1: fee(Date.now() - 1000), p2: fee(Date.now() + 5 * 86400_000, { feeDue: 99 }) });
  expect(result.current.overdueBlocked).toBe(true);
  expect(result.current.overdueTotal).toBe(45);          // only the overdue one
  expect(result.current.overdueFrom).toBe(Math.floor((Date.now() - 1000) / 1000) * 1000);
});

it('a paid or disputed fee does not', () => {
  const { result } = renderHook(() => useFeeArrears());
  emit({ p1: fee(Date.now() - 1000, { feePaid: true }), p2: fee(Date.now() - 1000, { engagementStatus: 'disputed' }) });
  expect(result.current.overdueBlocked).toBe(false);
  expect(result.current.overdueFrom).toBeNull();
});

it('the kill switch off means no block at all', () => {
  mockConfig = { paymentFailureGraceDays: 7, feeOverdueBlockEnabled: false };
  const { result } = renderHook(() => useFeeArrears());
  emit({ p1: fee(Date.now() - 1000) });
  expect(result.current.overdueBlocked).toBe(false);
  expect(result.current.overdueTotal).toBe(0);
});

it('a block that starts while the screen is open shows on the second, without a new snapshot', () => {
  const { result } = renderHook(() => useFeeArrears());
  const at = Date.now() + 60_000;
  emit({ p1: fee(at) });
  expect(result.current.overdueBlocked).toBe(false);
  act(() => { jest.advanceTimersByTime(60_000 + 100); });
  expect(result.current.overdueBlocked).toBe(true);
});

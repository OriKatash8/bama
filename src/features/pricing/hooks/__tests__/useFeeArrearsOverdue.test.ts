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

it('before any block: overdueSoon with the date and amount, not blocked', () => {
  const { result } = renderHook(() => useFeeArrears());
  const at = Date.now() + 5 * 86400_000;
  emit({ p1: fee(at) });
  expect(result.current.overdueBlocked).toBe(false);
  expect(result.current.overdueSoon).toBe(true);
  expect(result.current.soonTotal).toBe(45);
  expect(result.current.overdueFrom).toBe(Math.floor(at / 1000) * 1000);
});

it('soonTotal counts only fees that have not started blocking', () => {
  const { result } = renderHook(() => useFeeArrears());
  emit({ p1: fee(Date.now() + 5 * 86400_000, { feeDue: 99 }), p2: fee(Date.now() - 1000, { feeDue: 45 }) });
  expect(result.current.overdueBlocked).toBe(true);
  expect(result.current.overdueTotal).toBe(45);
  expect(result.current.soonTotal).toBe(99);
});

it('the warning turns into the block on the second the block starts', () => {
  const { result } = renderHook(() => useFeeArrears());
  emit({ p1: fee(Date.now() + 60_000) });
  expect(result.current.overdueSoon).toBe(true);
  act(() => { jest.advanceTimersByTime(60_000 + 100); });
  expect(result.current.overdueSoon).toBe(false);
  expect(result.current.overdueBlocked).toBe(true);
});

it('no warning for a paid fee', () => {
  const { result } = renderHook(() => useFeeArrears());
  emit({ p1: fee(Date.now() + 86400_000, { feePaid: true }) });
  expect(result.current.overdueSoon).toBe(false);
  expect(result.current.soonTotal).toBe(0);
});

it('no warning with the kill switch off', () => {
  mockConfig = { paymentFailureGraceDays: 7, feeOverdueBlockEnabled: false };
  const { result } = renderHook(() => useFeeArrears());
  emit({ p1: fee(Date.now() + 86400_000) });
  expect(result.current.overdueSoon).toBe(false);
  expect(result.current.soonTotal).toBe(0);
});

describe('bannerMode — which fee banner shows', () => {
  // A completed, owed, unpaid fee that was completed with the switch OFF carries no overdueAt.
  const noClock = (over: Record<string, unknown> = {}) => ({
    professionalId: 'pro-1', feeStatus: 'owed', status: 'pending', feePaid: false, feeDue: 45,
    engagementStatus: 'completed', ...over,
  });

  it('switch OFF: an unpaid fee is "unpaid" — never a warning, never blocked, no date', () => {
    mockConfig = { paymentFailureGraceDays: 7, feeOverdueBlockEnabled: false };
    const { result } = renderHook(() => useFeeArrears());
    emit({ p1: fee(Date.now() - 1000, { feeDue: 45 }), p2: noClock({ feeDue: 5 }) });
    expect(result.current.bannerMode).toBe('unpaid');
    expect(result.current.unpaidTotal).toBe(50);
    expect(result.current.overdueBlocked).toBe(false);
    expect(result.current.overdueSoon).toBe(false);
    expect(result.current.overdueFrom).toBeNull();
  });

  it('switch ON, fee with a future block date: "warning"', () => {
    const { result } = renderHook(() => useFeeArrears());
    emit({ p1: fee(Date.now() + 5 * 86400_000) });
    expect(result.current.bannerMode).toBe('warning');
  });

  it('switch ON, block in force: "blocked" wins over everything', () => {
    const { result } = renderHook(() => useFeeArrears());
    emit({ p1: fee(Date.now() - 1000), p2: fee(Date.now() + 5 * 86400_000), p3: noClock() });
    expect(result.current.bannerMode).toBe('blocked');
  });

  it('switch turned ON later: a fee completed while it was off stays "unpaid" (no clock, no block)', () => {
    const { result } = renderHook(() => useFeeArrears());
    emit({ p1: noClock() });
    expect(result.current.bannerMode).toBe('unpaid');
    expect(result.current.overdueBlocked).toBe(false);
  });

  it.each([
    ['paid', { feePaid: true }],
    ['settled', { status: 'paid' }],
    ['not owed', { status: 'not_owed' }],
    ['disputed', { status: 'disputed' }],
    ['exempt', { feeStatus: 'exempt' }],
    ['still running (not completed)', { engagementStatus: 'accepted' }],
    ['contested', { engagementStatus: 'disputed' }],
  ])('no banner for a %s fee', (_n, over) => {
    mockConfig = { paymentFailureGraceDays: 7, feeOverdueBlockEnabled: false };
    const { result } = renderHook(() => useFeeArrears());
    emit({ p1: noClock(over) });
    expect(result.current.bannerMode).toBeNull();
    expect(result.current.unpaidTotal).toBe(0);
  });
});

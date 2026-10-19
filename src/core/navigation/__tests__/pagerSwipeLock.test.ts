import {
  LOCK_SAFETY_MS,
  isPagerSwipeLocked,
  tabSwipeLockProps as p,
  usePagerSwipeLock,
} from '../pagerSwipeLock';

beforeEach(() => {
  jest.useFakeTimers();
  usePagerSwipeLock.getState().unlock();
});
afterEach(() => jest.useRealTimers());

const call = (fn: unknown) => (fn as () => void)();

it('a finger on the strip locks the tabs; lifting it unlocks', () => {
  call(p.onTouchStart);
  expect(isPagerSwipeLocked()).toBe(true);
  call(p.onTouchEnd);
  expect(isPagerSwipeLocked()).toBe(false);
});

it.each(['onTouchEnd', 'onTouchCancel', 'onPointerUp', 'onPointerCancel', 'onScrollEndDrag', 'onMomentumScrollEnd'] as const)(
  '%s releases the lock',
  (event) => {
    call(p.onTouchStart);
    call(p[event]);
    expect(isPagerSwipeLocked()).toBe(false);
  },
);

it.each(['onTouchStart', 'onPointerDown', 'onScrollBeginDrag'] as const)('%s takes the lock', (event) => {
  call(p[event]);
  expect(isPagerSwipeLocked()).toBe(true);
});

it('cannot stay stuck: the safety timer clears a lock whose unlock never came', () => {
  call(p.onTouchStart);
  jest.advanceTimersByTime(LOCK_SAFETY_MS + 1);
  expect(isPagerSwipeLocked()).toBe(false);
});

it('scroll events refresh the lock, so a long hold cannot expire mid-drag', () => {
  call(p.onTouchStart);
  for (let i = 0; i < 5; i++) {
    jest.advanceTimersByTime(LOCK_SAFETY_MS - 500);
    call(p.onScroll);
  }
  expect(isPagerSwipeLocked()).toBe(true);        // 5 × 3.5 s held, still locked
  jest.advanceTimersByTime(LOCK_SAFETY_MS + 1);   // scrolling stopped, never released
  expect(isPagerSwipeLocked()).toBe(false);
});

it('a scroll event never TAKES the lock (a programmatic scrollTo must not freeze the tabs)', () => {
  call(p.onScroll);
  expect(isPagerSwipeLocked()).toBe(false);
});

it('a fling then lift leaves the tabs free again', () => {
  call(p.onTouchStart);
  call(p.onScrollBeginDrag);
  call(p.onScrollEndDrag);  // finger lifted, momentum continues
  expect(isPagerSwipeLocked()).toBe(false);
  call(p.onMomentumScrollEnd);
  expect(isPagerSwipeLocked()).toBe(false);
});

it('strip config: no bounce/overscroll, 16ms scroll events', () => {
  expect(p.bounces).toBe(false);
  expect(p.overScrollMode).toBe('never');
  expect(p.scrollEventThrottle).toBe(16);
});

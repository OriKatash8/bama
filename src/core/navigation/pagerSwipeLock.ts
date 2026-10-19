import { create } from 'zustand';

/**
 * The tabs are swiped by a PanResponder on the tabs layout (it claims a horizontal drag that
 * starts within 50px of a screen edge). A horizontal strip inside a tab (category chips, filter
 * tags) that reaches the screen edges is inside that zone, and at the end of the strip, where
 * it cannot scroll, the layout steals the drag and changes tab.
 *
 * A strip raises this lock while a finger is on it; the layouts' PanResponders refuse to claim
 * a gesture while it is up. Spread `tabSwipeLockProps` on the strip's ScrollView.
 */

/**
 * Safety net only: a lock whose unlock event never arrived (e.g. a mouse released outside the
 * window) clears itself. Every scroll event refreshes it, so it cannot expire mid-drag.
 */
export const LOCK_SAFETY_MS = 4000;

type PagerSwipeLockState = { locked: boolean; lock: () => void; unlock: () => void; refresh: () => void };

let timer: ReturnType<typeof setTimeout> | null = null;
const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };

export const usePagerSwipeLock = create<PagerSwipeLockState>((set, get) => {
  const arm = () => {
    clearTimer();
    timer = setTimeout(() => { timer = null; set({ locked: false }); }, LOCK_SAFETY_MS);
  };
  return {
    locked: false,
    lock: () => {
      arm();
      if (!get().locked) set({ locked: true });
    },
    unlock: () => {
      clearTimer();
      if (get().locked) set({ locked: false });
    },
    // Keeps an existing lock alive. Never takes one: a programmatic scroll (scrollToEnd) also
    // emits scroll events and must not leave the tabs locked.
    refresh: () => { if (get().locked) arm(); },
  };
});

/** Read by the layouts' PanResponders (non-reactive: no re-render). */
export const isPagerSwipeLocked = () => usePagerSwipeLock.getState().locked;

const lock = () => usePagerSwipeLock.getState().lock();
const unlock = () => usePagerSwipeLock.getState().unlock();
const refresh = () => usePagerSwipeLock.getState().refresh();

/**
 * Props for a horizontal ScrollView that must never switch tabs. Touch events cover native;
 * pointer events cover a mouse drag on web. No bounce/overscroll, so hitting an end does not
 * hand the gesture on.
 */
export const tabSwipeLockProps = {
  onTouchStart: lock,
  onTouchEnd: unlock,
  onTouchCancel: unlock,
  onPointerDown: lock,
  onPointerUp: unlock,
  onPointerCancel: unlock,
  onScrollBeginDrag: lock,
  onScrollEndDrag: unlock,
  onMomentumScrollEnd: unlock,
  onScroll: refresh,
  scrollEventThrottle: 16,
  bounces: false,
  overScrollMode: 'never',
} as const;

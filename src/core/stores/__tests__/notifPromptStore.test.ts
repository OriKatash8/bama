// AsyncStorage is a native module and does not load under jest; the package ships
// an official mock for exactly this. The store imports it for zustand's persist
// adapter, which these tests never exercise — they assert the predicate and the
// in-memory state transition.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  isPromptSnoozed,
  useNotifPromptStore,
  NOTIF_PROMPT_COOLDOWN_MS,
} from '../notifPromptStore';

/**
 * The prompt is silenced per USER, never per surface. The chat list and the
 * dashboard read this same predicate, so dismissing on one has to silence the
 * other — that is the requirement these tests exist to pin.
 */
describe('isPromptSnoozed', () => {
  const NOW = 1_700_000_000_000;

  it('is not snoozed when nothing was ever dismissed', () => {
    expect(isPromptSnoozed({}, 'u1', NOW)).toBe(false);
  });

  it('is snoozed while the cooldown is running', () => {
    expect(isPromptSnoozed({ u1: NOW + 1000 }, 'u1', NOW)).toBe(true);
  });

  it('is not snoozed once the cooldown has passed', () => {
    expect(isPromptSnoozed({ u1: NOW - 1 }, 'u1', NOW)).toBe(false);
  });

  it('treats the exact expiry instant as expired', () => {
    expect(isPromptSnoozed({ u1: NOW }, 'u1', NOW)).toBe(false);
  });

  it("does not silence a different user's prompt", () => {
    expect(isPromptSnoozed({ u1: NOW + 1000 }, 'u2', NOW)).toBe(false);
  });

  it('is not snoozed when there is no signed-in user', () => {
    expect(isPromptSnoozed({ u1: NOW + 1000 }, undefined, NOW)).toBe(false);
  });
});

describe('dismissal is shared across surfaces', () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    useNotifPromptStore.setState({ dismissedUntil: {} });
  });

  it('a dismissal made on one surface hides the prompt on every other', () => {
    // The chat list dismisses...
    useNotifPromptStore.getState().dismiss('u1', NOW);
    const { dismissedUntil } = useNotifPromptStore.getState();

    // ...and the dashboard, reading the same keyed state, is silenced too.
    expect(isPromptSnoozed(dismissedUntil, 'u1', NOW + 1000)).toBe(true);
    expect(dismissedUntil.u1).toBe(NOW + NOTIF_PROMPT_COOLDOWN_MS);
  });

  it('the shared dismissal expires after the cooldown, everywhere at once', () => {
    useNotifPromptStore.getState().dismiss('u1', NOW);
    const { dismissedUntil } = useNotifPromptStore.getState();

    expect(isPromptSnoozed(dismissedUntil, 'u1', NOW + NOTIF_PROMPT_COOLDOWN_MS - 1)).toBe(true);
    expect(isPromptSnoozed(dismissedUntil, 'u1', NOW + NOTIF_PROMPT_COOLDOWN_MS)).toBe(false);
  });

  it('keeps users independent', () => {
    useNotifPromptStore.getState().dismiss('u1', NOW);
    const { dismissedUntil } = useNotifPromptStore.getState();
    expect(isPromptSnoozed(dismissedUntil, 'u2', NOW + 1000)).toBe(false);
  });
});

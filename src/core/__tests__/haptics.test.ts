import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { tapFeedback, commitFeedback, warnFeedback } from '../haptics';

/**
 * Haptics are a native-only affordance here.
 *
 * expo-haptics does NOT no-op on web — it falls through to the Web Vibration
 * API, which is silent on desktop Chrome but can genuinely buzz a phone
 * browser. BAMA is tested on web at localhost:8081 and on iPhone, and the two
 * must not diverge, so the gate is ours rather than the module's.
 *
 * These wrappers are also fire-and-forget: every call site is a touch handler,
 * and a rejected haptics promise (no motor, permission denied, OS refusal)
 * must never reach the user as an unhandled rejection.
 */

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const mockHaptics = Haptics as jest.Mocked<typeof Haptics>;

function setPlatform(os: 'ios' | 'android' | 'web') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform('ios');
});

describe('tapFeedback', () => {
  it('fires a selection haptic on native', () => {
    tapFeedback();
    expect(mockHaptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('does nothing on web', () => {
    setPlatform('web');
    tapFeedback();
    expect(mockHaptics.selectionAsync).not.toHaveBeenCalled();
  });
});

describe('commitFeedback', () => {
  it('fires a light impact on native', () => {
    commitFeedback();
    expect(mockHaptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(mockHaptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('does nothing on web', () => {
    setPlatform('web');
    commitFeedback();
    expect(mockHaptics.impactAsync).not.toHaveBeenCalled();
  });
});

describe('warnFeedback', () => {
  it('fires a Warning notification on native — a distinct pattern from a commit', () => {
    warnFeedback();
    expect(mockHaptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(mockHaptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Warning,
    );
    expect(mockHaptics.impactAsync).not.toHaveBeenCalled();
  });

  it('does nothing on web', () => {
    setPlatform('web');
    warnFeedback();
    expect(mockHaptics.notificationAsync).not.toHaveBeenCalled();
  });
});

describe('failure is swallowed', () => {
  it('a rejected selection haptic does not reject to the caller', async () => {
    mockHaptics.selectionAsync.mockRejectedValueOnce(new Error('no haptics motor'));
    expect(() => tapFeedback()).not.toThrow();
    await Promise.resolve();
  });

  it('a rejected impact haptic does not reject to the caller', async () => {
    mockHaptics.impactAsync.mockRejectedValueOnce(new Error('no haptics motor'));
    expect(() => commitFeedback()).not.toThrow();
    await Promise.resolve();
  });

  it('a rejected warning haptic does not reject to the caller', async () => {
    mockHaptics.notificationAsync.mockRejectedValueOnce(new Error('no haptics motor'));
    expect(() => warnFeedback()).not.toThrow();
    await Promise.resolve();
  });

  it('returns void, so no call site can await or chain it', () => {
    expect(tapFeedback()).toBeUndefined();
    expect(commitFeedback()).toBeUndefined();
    expect(warnFeedback()).toBeUndefined();
  });
});

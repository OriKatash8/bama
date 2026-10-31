/**
 * Android 13+ shows no notification prompt for an app with no channel, so the
 * `default` channel must be created before every permission request, in every
 * registration path. On iOS and web nothing about the flow changes.
 */
import { Platform } from 'react-native';

const calls: string[] = [];

const mockNotifications = {
  AndroidImportance: { MAX: 5 },
  setNotificationChannelAsync: jest.fn(async () => { calls.push('channel'); }),
  getPermissionsAsync: jest.fn(async () => { calls.push('getPerms'); return { status: 'undetermined', canAskAgain: true }; }),
  requestPermissionsAsync: jest.fn(async () => { calls.push('requestPerms'); return { status: 'granted', canAskAgain: true }; }),
  getExpoPushTokenAsync: jest.fn(async () => { calls.push('token'); return { data: 'ExponentPushToken[abc]' }; }),
};

jest.mock('expo-notifications', () => mockNotifications);
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'p' } } } } }));
jest.mock('firebase/firestore', () => ({ deleteField: jest.fn(), serverTimestamp: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({ setDocument: jest.fn(async () => {}), updateDocument: jest.fn(async () => {}) }));
jest.mock('@core/stores/authStore', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }));
jest.mock('@core/i18n', () => ({ __esModule: true, default: { language: 'en' } }));

const realOS = Platform.OS;

function load(os: 'android' | 'ios' | 'web') {
  (Platform as { OS: string }).OS = os;
  let mod!: typeof import('../registerForPushNotifications');
  jest.isolateModules(() => {
    mod = require('../registerForPushNotifications');
  });
  return mod;
}

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  (Platform as { OS: string }).OS = realOS;
});

describe('on Android', () => {
  it('registerForPushNotifications: channel before any permission call', async () => {
    const { registerForPushNotifications } = load('android');
    await registerForPushNotifications();
    expect(calls.slice(0, 3)).toEqual(['channel', 'getPerms', 'requestPerms']);
  });

  it('requestNotificationPermission (soft-ask and settings): channel before requestPermissionsAsync', async () => {
    const { requestNotificationPermission } = load('android');
    await requestNotificationPermission();
    expect(calls.indexOf('channel')).toBe(0);
    expect(calls.indexOf('channel')).toBeLessThan(calls.indexOf('requestPerms'));
  });

  it('registerIfGranted: channel before the permission read', async () => {
    const { registerIfGranted } = load('android');
    await registerIfGranted();
    expect(calls[0]).toBe('channel');
    expect(calls).not.toContain('requestPerms');
  });

  it('creates the channel once across calls, with the original config', async () => {
    const { registerForPushNotifications, requestNotificationPermission, registerIfGranted } = load('android');
    await registerForPushNotifications();
    await requestNotificationPermission();
    await registerIfGranted();
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledTimes(1);
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', {
      name: 'default',
      importance: 5,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#208AEF',
    });
  });

  it('a failed channel creation does not block registration, and is retried next time', async () => {
    const { registerForPushNotifications } = load('android');
    mockNotifications.setNotificationChannelAsync.mockRejectedValueOnce(new Error('boom'));
    await expect(registerForPushNotifications()).resolves.toBe('ExponentPushToken[abc]');
    await registerForPushNotifications();
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledTimes(2);
  });
});

describe.each(['ios', 'web'] as const)('on %s', (os) => {
  it('never touches notification channels, and the flow is unchanged', async () => {
    const m = load(os);
    await m.registerForPushNotifications();
    await m.requestNotificationPermission();
    await m.registerIfGranted();
    expect(mockNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(calls).not.toContain('channel');
    expect(calls.slice(0, 2)).toEqual(['getPerms', 'requestPerms']);
  });
});

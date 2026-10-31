import { Platform } from 'react-native';
import { recordLaunch, appVersionString } from '../recordLaunch';
import { setDocument } from '@core/firebase/firestore';

let mockVersion: string | null = '1.0.0';
let mockBuild: string | null = '43';
jest.mock('expo-application', () => ({
  get nativeApplicationVersion() { return mockVersion; },
  get nativeBuildVersion() { return mockBuild; },
}));
jest.mock('firebase/firestore', () => ({ serverTimestamp: () => 'SERVER_TS' }));
jest.mock('@core/firebase/firestore', () => ({ setDocument: jest.fn() }));

const realOS = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  mockVersion = '1.0.0';
  mockBuild = '43';
  (Platform as { OS: string }).OS = 'android';
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { (Platform as { OS: string }).OS = realOS; jest.restoreAllMocks(); });

describe('appVersionString', () => {
  it('is the store version and the build number', () => {
    expect(appVersionString()).toBe('1.0.0 (43)');
  });
  it('falls back to what exists (web / no build number)', () => {
    mockBuild = null;
    expect(appVersionString()).toBe('1.0.0');
    mockVersion = null;
    expect(appVersionString()).toBe('unknown');
  });
});

describe('recordLaunch', () => {
  it('writes exactly platform, version and the server timestamp to the PRIVATE presence doc', async () => {
    await recordLaunch('u1');
    expect(setDocument).toHaveBeenCalledTimes(1);
    expect(setDocument).toHaveBeenCalledWith('users/u1/private/presence', {
      lastPlatform: 'android',
      appVersion: '1.0.0 (43)',
      lastSeenAt: 'SERVER_TS',
    });
  });

  it('reports the real platform', async () => {
    (Platform as { OS: string }).OS = 'ios';
    await recordLaunch('u1');
    expect((setDocument as jest.Mock).mock.calls[0][1].lastPlatform).toBe('ios');
  });

  it('never touches the public user doc', async () => {
    await recordLaunch('u1');
    expect((setDocument as jest.Mock).mock.calls.every(([path]) => path !== 'users/u1')).toBe(true);
  });

  it('swallows a failed write (rules, offline) instead of throwing', async () => {
    (setDocument as jest.Mock).mockRejectedValueOnce(new Error('permission-denied'));
    await expect(recordLaunch('u1')).resolves.toBeUndefined();
  });
});

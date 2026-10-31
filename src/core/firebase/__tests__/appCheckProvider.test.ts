import { Platform } from 'react-native';
import { initAppCheck } from '../appCheck';

const mockConfigure = jest.fn();

jest.mock('@react-native-firebase/app', () => ({ getApp: jest.fn() }), { virtual: true });
jest.mock(
  '@react-native-firebase/app-check',
  () => ({
    initializeAppCheck: jest.fn(async () => ({ getToken: jest.fn() })),
    ReactNativeFirebaseAppCheckProvider: jest.fn(() => ({ configure: mockConfigure })),
  }),
  { virtual: true },
);
jest.mock('firebase/app-check', () => ({
  initializeAppCheck: jest.fn(),
  CustomProvider: jest.fn(),
}));

const originalOS = Platform.OS;
const originalFlag = process.env.EXPO_PUBLIC_APPCHECK_DEBUG;
const globalDev = globalThis as unknown as { __DEV__: boolean };
const originalDev = globalDev.__DEV__;

async function run(os: 'android' | 'ios', dev: boolean, flag?: string) {
  (Platform as { OS: string }).OS = os;
  globalDev.__DEV__ = dev;
  if (flag === undefined) delete process.env.EXPO_PUBLIC_APPCHECK_DEBUG;
  else process.env.EXPO_PUBLIC_APPCHECK_DEBUG = flag;
  mockConfigure.mockClear();
  await initAppCheck({} as never);
  return mockConfigure.mock.calls[0][0];
}

describe('initAppCheck provider selection', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    (Platform as { OS: string }).OS = originalOS;
    globalDev.__DEV__ = originalDev;
    if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_APPCHECK_DEBUG;
    else process.env.EXPO_PUBLIC_APPCHECK_DEBUG = originalFlag;
    jest.restoreAllMocks();
  });

  it('android: debug in __DEV__', async () => {
    expect((await run('android', true)).android.provider).toBe('debug');
  });
  it('android: debug in a release build with the flag set', async () => {
    expect((await run('android', false, '1')).android.provider).toBe('debug');
  });
  it('android: Play Integrity in release without the flag', async () => {
    expect((await run('android', false)).android.provider).toBe('playIntegrity');
    expect((await run('android', false, '0')).android.provider).toBe('playIntegrity');
  });
  it('ios: unaffected by the flag', async () => {
    expect((await run('ios', false, '1')).apple.provider).toBe('appAttestWithDeviceCheckFallback');
    expect((await run('ios', true)).apple.provider).toBe('debug');
  });
});

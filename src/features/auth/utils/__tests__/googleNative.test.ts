import { Platform, TurboModuleRegistry, NativeModules } from 'react-native';
import { isGoogleNativeLinked, isGoogleSignInAvailable } from '../googleNative';

const setOS = (os: 'ios' | 'android' | 'web') => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
const realOS = Platform.OS;
afterEach(() => { jest.restoreAllMocks(); delete (NativeModules as Record<string, unknown>).RNGoogleSignin; });
afterAll(() => setOS(realOS as 'ios'));

describe('Google sign-in availability', () => {
  it('missing native module (older build): not linked, button hidden on iOS and Android', () => {
    jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue(null);
    expect(isGoogleNativeLinked()).toBe(false);
    for (const os of ['ios', 'android'] as const) {
      setOS(os);
      expect(isGoogleSignInAvailable()).toBe(false);
    }
  });

  it('module present: linked and available', () => {
    jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue({} as never);
    expect(isGoogleNativeLinked()).toBe(true);
    setOS('ios');
    expect(isGoogleSignInAvailable()).toBe(true);
  });

  it('the registry throwing is treated as missing, not a crash', () => {
    jest.spyOn(TurboModuleRegistry, 'get').mockImplementation(() => { throw new Error('boom'); });
    expect(isGoogleNativeLinked()).toBe(false);
  });

  it('web never needs the native module', () => {
    jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue(null);
    setOS('web');
    expect(isGoogleSignInAvailable()).toBe(true);
  });
});

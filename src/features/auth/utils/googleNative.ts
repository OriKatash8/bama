import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { GOOGLE_SIGNIN_ENABLED } from '@core/constants/auth';

/**
 * Whether Google sign-in can run on THIS device. On web it always can (the
 * Firebase popup). On iOS / Android it needs the RNGoogleSignin native module,
 * which exists only in builds made after it was linked back in: an older dev
 * build or store build lacks it, and requiring the package there crashes
 * ("TurboModuleRegistry.getEnforcing: 'RNGoogleSignin' could not be found").
 * Such a build hides the Google button instead. Checked without throwing.
 */
export function isGoogleNativeLinked(): boolean {
  try {
    return TurboModuleRegistry.get('RNGoogleSignin') != null || NativeModules.RNGoogleSignin != null;
  } catch {
    return false;
  }
}

export function isGoogleSignInAvailable(): boolean {
  if (!GOOGLE_SIGNIN_ENABLED) return false;
  return Platform.OS === 'web' || isGoogleNativeLinked();
}

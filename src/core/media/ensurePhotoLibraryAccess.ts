import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * Ask for photo-library read access, once, before opening the media picker (iOS).
 *
 * The picker itself needs no permission (it is the system's out-of-process PHPicker), but
 * expo-image-picker only takes its fast path for videos — streaming the original with
 * PHAssetResourceManager — when read access is authorized or limited. Without it, it falls
 * back to loadFileRepresentation plus an extra copy, which is what made picking take ~20 s.
 *
 * Only an undetermined status triggers the prompt, and iOS shows it once ever, so later picks
 * never nag. Denied or limited access is fine: the picker still opens, just on the slow path.
 * Never throws and never blocks the pick.
 */
export async function ensurePhotoLibraryAccess(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (current.status === 'undetermined') await ImagePicker.requestMediaLibraryPermissionsAsync();
  } catch (err) {
    if (__DEV__) console.log('[pick] photo-library permission check failed, opening picker anyway:', err);
  }
}

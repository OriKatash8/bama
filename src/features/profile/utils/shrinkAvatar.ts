/** Wide enough for the largest place a profile photo is shown, with room for 3x screens. */
const AVATAR_WIDTH = 512;

/**
 * A profile photo, shrunk before upload: 512px wide (ratio kept), JPEG at 0.8.
 * Photos went up at full camera size — several MB each, shown at 28–120px —
 * which is what made the chat's pictures slow to arrive.
 *
 * Loaded lazily, and any failure hands back the original: a build made before
 * expo-image-manipulator was added has no native module, and the upload then
 * goes ahead exactly as it used to rather than failing.
 */
export async function shrinkAvatar(uri: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ImageManipulator, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const rendered = await ImageManipulator.manipulate(uri).resize({ width: AVATAR_WIDTH, height: null }).renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    return saved.uri;
  } catch (err) {
    console.warn('[shrinkAvatar] uploading the original:', err);
    return uri;
  }
}

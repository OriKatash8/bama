export type PrepareImageOptions = {
  /** Longest side in pixels. Smaller images are never enlarged. */
  maxSide: number;
  /** JPEG quality, 0–1. */
  quality: number;
};

/** Chat pictures: shown small, sent often. */
export const CHAT_IMAGE: PrepareImageOptions = { maxSide: 2048, quality: 0.8 };
/** Portfolio pictures: professionals showing their work. */
export const PORTFOLIO_IMAGE: PrepareImageOptions = { maxSide: 3072, quality: 0.85 };

/**
 * A picked or captured photo, made ready to upload: EXIF orientation applied (the native
 * loader does it, so portraits stay upright), longest side capped at `maxSide`, saved as
 * a real JPEG (HEIC never goes up under a .jpg name) and stripped of EXIF/GPS.
 *
 * The picker returns the original file untouched, so this runs when the user taps Send.
 * Loaded lazily; any failure (or a build without the native module) hands back the
 * original so a problem here never blocks a send.
 */
export async function prepareImageForUpload(uri: string, opts: PrepareImageOptions): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ImageManipulator, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    // First render only reads the size (orientation already fixed on load).
    let rendered = await ImageManipulator.manipulate(uri).renderAsync();
    const { width, height } = rendered;
    if (Math.max(width, height) > opts.maxSide) {
      const size = width >= height ? { width: opts.maxSide, height: null } : { width: null, height: opts.maxSide };
      rendered = await ImageManipulator.manipulate(rendered).resize(size).renderAsync();
    }
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: opts.quality });
    return saved.uri;
  } catch (err) {
    console.warn('[prepareImageForUpload] uploading the original:', err);
    return uri;
  }
}

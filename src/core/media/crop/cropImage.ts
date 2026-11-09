export type EditableImage = { uri: string; width: number; height: number };
export type PixelCrop = { originX: number; originY: number; width: number; height: number };

/** Photos are edited at no more than this on the long side (a 48 MP photo would be slow to crop). */
export const MAX_EDIT_SIDE = 4096;

function manipulator() {
  // Lazy, like prepareImageForUpload: a build without the native module must not crash on import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-image-manipulator') as typeof import('expo-image-manipulator');
}

/**
 * Bake EXIF orientation into the pixels and cap the size, so the editor's picture, its pixel
 * dimensions and the later crop all describe the same upright image (the picker now returns
 * the original file, HEIC and rotation tag included).
 */
export async function normalizeForEditing(uri: string): Promise<EditableImage> {
  const { ImageManipulator, SaveFormat } = manipulator();
  let ref = await ImageManipulator.manipulate(uri).renderAsync();
  if (Math.max(ref.width, ref.height) > MAX_EDIT_SIDE) {
    const size = ref.width >= ref.height ? { width: MAX_EDIT_SIDE, height: null } : { width: null, height: MAX_EDIT_SIDE };
    ref = await ImageManipulator.manipulate(ref).resize(size).renderAsync();
  }
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * Rotate (clockwise quarter turns), then crop. The crop rect is in the ROTATED image's pixels,
 * which is what the editor shows. Saved as a JPEG; prepareImageForUpload still does the final
 * resize and compression at Send.
 */
export async function applyCrop(
  uri: string,
  edit: { quarterTurns: number; crop: PixelCrop },
): Promise<EditableImage> {
  const { ImageManipulator, SaveFormat } = manipulator();
  let ctx = ImageManipulator.manipulate(uri);
  if (edit.quarterTurns % 4 !== 0) ctx = ctx.rotate((edit.quarterTurns % 4) * 90);
  ctx = ctx.crop(edit.crop);
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

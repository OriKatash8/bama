import { Platform } from 'react-native';

/**
 * Android-only A/B switches for the tab-screen draw cost.
 *
 * Measured on a Samsung S23 FE with "Profile HWUI rendering": on every tab screen
 * the render-thread bars sit far above the green line, inside the chat room they
 * stay low. So the tab screens are expensive to DRAW, not (mainly) to run in JS.
 * Each flag below turns off one suspected draw cost on Android ONLY, so each can
 * be tested, kept or reverted on its own. iOS and web are never affected: every
 * value is `Platform.OS === 'android' && <flag>`.
 *
 * To revert a test, set its flag to false. To make one permanent, delete the flag
 * and keep the new behaviour.
 */
const ON_ANDROID = Platform.OS === 'android';

/** 1. Drop every shadow() boxShadow and elevation (and the tab-bar capsule shadow). */
const DISABLE_SHADOWS = false;
/** 2. Load small thumbnails instead of full-size bitmaps for tab-screen images. */
const SIZED_IMAGES = true;
/** 3. Flatten stacked overlays / gradients behind tab-screen lists. */
const FLATTEN_OVERLAYS = false;

export const androidPerf = {
  disableShadows: ON_ANDROID && DISABLE_SHADOWS,
  sizedImages: ON_ANDROID && SIZED_IMAGES,
  flattenOverlays: ON_ANDROID && FLATTEN_OVERLAYS,
} as const;

/**
 * Spread onto expo-image `<Image>` elements that show opaque PHOTOS (avatars,
 * listing and cover photos) on the tab screens. Android decodes them as RGB_565,
 * half the bytes to decode and upload to the GPU; not for images that need an
 * alpha channel. Empty off Android or with the flag off.
 */
export const androidPhotoProps: { decodeFormat?: 'rgb' } = androidPerf.sizedImages ? { decodeFormat: 'rgb' } : {};

/**
 * The header logo. The original is 6250 x 6250 px (7.5 MB) drawn into a 72 dp
 * view on EVERY tab screen (and not in the chat room, which has its own header).
 * The 384 px copy is the same artwork, 18 KB.
 */
export const HEADER_LOGO = androidPerf.sizedImages
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../assets/images/bama-logo-2-small.png')
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../assets/images/bama-logo-2.png');

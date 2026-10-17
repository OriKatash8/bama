import { Platform } from 'react-native';
import { VIDEO_DURATION_TOLERANCE_SECONDS } from '@core/constants/video';
import { confirmDialog } from '@utils/confirmDialog';

type DurationAsset = { uri: string; duration?: number | null };

/** Read a web blob/object URL's length from its metadata. Null if it cannot be read in time. */
function probeWebDuration(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const el = document.createElement('video');
    const done = (v: number | null) => {
      el.removeAttribute('src');
      el.load();
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 5000);
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(el.duration) ? el.duration : null);
    };
    el.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    el.src = uri;
  });
}

/**
 * Length in seconds. The picker reports `duration` in milliseconds on iOS and Android;
 * on web it is usually missing, so read it from the file itself. Null = unknown.
 */
export async function getVideoSeconds(asset: DurationAsset): Promise<number | null> {
  if (typeof asset.duration === 'number' && asset.duration > 0) return asset.duration / 1000;
  if (Platform.OS === 'web') return probeWebDuration(asset.uri);
  return null;
}

export function exceedsDuration(seconds: number | null, maxSeconds: number): boolean {
  return seconds != null && seconds > maxSeconds + VIDEO_DURATION_TOLERANCE_SECONDS;
}

/** "3 minutes" / "a minute" / "90 seconds", in the caller's language via its t(). */
export function formatLimit(maxSeconds: number, t: (key: string) => string): string {
  if (maxSeconds % 60 === 0) {
    const m = maxSeconds / 60;
    return m === 1 ? t('media.limit_one_minute') : `${m} ${t('media.limit_minutes')}`;
  }
  return `${maxSeconds} ${t('media.limit_seconds')}`;
}

/**
 * Check a picked video against `maxSeconds`. Too long: tell the user (friendly, in their
 * language) and return false so the caller does not upload. Unknown length passes.
 */
export async function ensureVideoWithinLimit(
  asset: DurationAsset,
  maxSeconds: number,
  t: (key: string) => string
): Promise<boolean> {
  const seconds = await getVideoSeconds(asset);
  if (!exceedsDuration(seconds, maxSeconds)) return true;
  await confirmDialog(
    t('media.video_too_long_title'),
    t('media.video_too_long_body').replace('{{limit}}', formatLimit(maxSeconds, t)),
    { confirm: t('media.video_too_long_ok'), cancel: t('media.video_cancel'), destructive: false }
  );
  return false;
}

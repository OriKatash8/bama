import { Platform, TurboModuleRegistry } from 'react-native';
import { VIDEO_TRIM_ENABLED } from '@core/constants/video';
import { createDevTimer } from '@core/media/pickTiming';

export type TrimLabels = {
  /** Editor's confirm button ("Done"). */
  done: string;
  cancel: string;
  /** Shown while the cut is being written ("Trimming…"). */
  working: string;
  /** Shown if the file cannot be opened. */
  failedTitle: string;
  failedBody: string;
  failedClose: string;
};

export type TrimmedVideo = {
  /** file:// URI of the trimmed copy. */
  uri: string;
  /** milliseconds, the same unit ImagePicker reports */
  durationMs: number;
};

/** Is the native module in this binary? A JS-only update on an older dev client has no VideoTrim. */
function nativeModulePresent(): boolean {
  try {
    return TurboModuleRegistry.get('VideoTrim') != null;
  } catch {
    return false;
  }
}

/**
 * True when the Trim button / trimmer should be offered: the flag is on, we are native, and the
 * binary actually contains the module (otherwise the app falls back to the old "too long"
 * dialog instead of crashing on a build made before the module was added).
 */
export function canTrimVideo(): boolean {
  return VIDEO_TRIM_ENABLED && Platform.OS !== 'web' && nativeModulePresent();
}

function lib() {
  // Lazy: no web build, and a build without the native module must not crash on import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-video-trim') as typeof import('react-native-video-trim');
}

const toFileUri = (path: string) => (path.startsWith('file://') ? path : `file://${path}`);

// The editor reports "finished" and "hidden" as separate events, in that order. We resolve on
// "hidden" so the caller never presents anything while the native editor is still dismissing;
// these are the grace periods for a missing event.
const HIDE_GRACE_MS = 150; // after "hidden", for a "finished" that arrives just behind it
const FINISH_FALLBACK_MS = 1500; // after "finished"/"cancel", if "hidden" never comes

/**
 * Open the native trimmer on `uri`. Resolves with the trimmed copy, or null if the user backed
 * out or it failed (a failure has already been reported by the editor's own alert). Resolves
 * once the editor is gone from the screen.
 *
 * Precise trimming only: frame-accurate, so `maxDurationMs` is respected exactly. The editor's
 * flip/rotate/crop/speed tools are off (we only want a cut), and nothing is saved to Photos or
 * shared. The result is H.264 at roughly the source bitrate; startVideoCompression still runs
 * afterwards to bring it down to the chat preset.
 */
export function openVideoTrimmer(
  uri: string,
  opts: { maxDurationMs?: number; labels: TrimLabels; accent: string; timer?: { mark: (step: string) => void } },
): Promise<TrimmedVideo | null> {
  const log = opts.timer ?? createDevTimer('trim');
  return new Promise((resolve) => {
    let VideoTrim: ReturnType<typeof lib>;
    try {
      VideoTrim = lib();
    } catch {
      resolve(null); // module missing in this binary: nothing to open
      return;
    }
    const subs: { remove: () => void }[] = [];
    let settled = false;
    let result: TrimmedVideo | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      subs.forEach((s) => s.remove());
      resolve(result);
    };
    const settleSoon = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(settle, ms);
    };

    subs.push(
      VideoTrim.default.onFinishTrimming(({ outputPath, duration }) => {
        log.mark(`finished (${Math.round(duration)}ms of video) ${outputPath}`);
        result = { uri: toFileUri(outputPath), durationMs: duration };
        settleSoon(FINISH_FALLBACK_MS);
      }),
      VideoTrim.default.onCancel(() => { log.mark('cancelled'); settleSoon(FINISH_FALLBACK_MS); }),
      VideoTrim.default.onError((e) => { log.mark(`error ${e?.errorCode}: ${e?.message}`); settleSoon(FINISH_FALLBACK_MS); }),
      VideoTrim.default.onHide(() => { log.mark('editor hidden'); settleSoon(HIDE_GRACE_MS); }),
    );
    if (__DEV__) {
      // Timing only: when the editor is visible, the file is loaded, and "Done" starts the cut.
      let lastStats = 0;
      subs.push(
        VideoTrim.default.onShow(() => log.mark('editor visible')),
        VideoTrim.default.onLoad((e) => log.mark(`media loaded (${Math.round(e?.duration ?? 0)}ms)`)),
        VideoTrim.default.onStartTrimming(() => log.mark('Done tapped, trimming started')),
        // The exact ffmpeg command, once, and the encode speed every ~2 s.
        VideoTrim.default.onLog((e) => {
          if (/^Command:/.test(e?.message ?? '')) console.log(`[trim] ffmpeg ${e.message}`);
        }),
        VideoTrim.default.onStatistics((e) => {
          const now = Date.now();
          if (now - lastStats < 2000) return;
          lastStats = now;
          console.log(`[trim] encoding: speed=${e.speed}x fps=${e.videoFps} bitrate=${Math.round(e.bitrate)} t=${Math.round(e.time)}ms`);
        }),
      );
    }

    try {
      log.mark('showEditor called');
      VideoTrim.showEditor(uri, {
        type: 'video',
        outputExt: 'mp4',
        enablePreciseTrimming: true,
        saveToPhoto: false,
        openDocumentsOnFinish: false,
        openShareSheetOnFinish: false,
        enableEditTools: false,
        maxDuration: opts.maxDurationMs ?? -1,
        minDuration: 1000,
        theme: 'dark',
        trimmerColor: opts.accent,
        handleIconColor: '#ffffff',
        saveButtonText: opts.labels.done,
        cancelButtonText: opts.labels.cancel,
        trimmingText: opts.labels.working,
        enableSaveDialog: false,
        enableCancelDialog: false,
        alertOnFailToLoad: true,
        alertOnFailTitle: opts.labels.failedTitle,
        alertOnFailMessage: opts.labels.failedBody,
        alertOnFailCloseText: opts.labels.failedClose,
        closeWhenFinish: true,
      });
    } catch {
      settle();
    }
  });
}

/** Delete the trimmer's temporary outputs. Call only when nothing is using them. Never throws. */
export function cleanTrimmedFiles(): void {
  if (!canTrimVideo()) return;
  try {
    void lib().cleanFiles().catch(() => {});
  } catch {
    /* module missing: nothing to clean */
  }
}

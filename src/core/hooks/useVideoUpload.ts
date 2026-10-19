import { useState, useEffect, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { uploadFile } from '@core/firebase/storage';
import { startVideoCompression, CompressionCancelled } from '@core/video/compressForUpload';
import { VIDEO_PROCESSING_TIMEOUT_MS } from '@core/constants/video';
import { callFunction } from '@core/firebase/functions';

/**
 * Tell the server to throw away an upload it already has (or is about to have): it deletes the
 * compressed output and the job doc, or marks the job so compressVideo discards it. Best-effort,
 * one retry; the server derives every path from the verified one, so a bad call just fails.
 */
export async function cancelServerJob(filePath: string): Promise<void> {
  const call = callFunction<{ filePath: string }, unknown>('cancelVideoJob', 'europe-west1');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await call({ filePath });
      return;
    } catch (e) {
      if (attempt === 1) console.warn('[useVideoUpload] cancelVideoJob failed for', filePath, e);
    }
  }
}

type VideoJobStatus = {
  status: 'processing' | 'done' | 'error';
  url?: string;
  error?: string;
};

/**
 * compressing → uploading → processing (waiting on the videoJobs doc).
 * `processing` with `slow` set means VIDEO_PROCESSING_TIMEOUT_MS passed: still listening.
 */
export type VideoUploadStage = 'idle' | 'compressing' | 'uploading' | 'processing';

export type UseVideoUploadResult = {
  stage: VideoUploadStage;
  /** 0..1 within the current stage (compressing / uploading); 0 otherwise. */
  progress: number;
  /** Processing outlasted the timeout. Not a failure: the job doc is still being watched. */
  slow: boolean;
  /** Compressing or uploading (kept for existing callers). */
  uploading: boolean;
  processing: boolean;
  url: string | null;
  error: string | null;
  /** How the most recent uploadVideo() ended; lets a caller tell Cancel from a failure. */
  getOutcome: () => 'ok' | 'cancelled' | 'failed' | null;
  /** Stop whatever stage is running. The pending uploadVideo() resolves null with no error. */
  cancel: () => void;
  uploadVideo: (
    destination: 'portfolio' | 'chat-videos' | 'courses',
    userId: string,
    asset?: ImagePicker.ImagePickerAsset
  ) => Promise<string | null>;
};

export function useVideoUpload(): UseVideoUploadResult {
  const [stage, setStage] = useState<VideoUploadStage>('idle');
  const [progress, setProgress] = useState(0);
  const [slow, setSlow] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unsubRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by every start and by cancel(); work from an older run must not touch state.
  const runRef = useRef(0);
  const cancelRef = useRef<(() => void) | null>(null);
  const finishRef = useRef<((v: string | null) => void) | null>(null);
  const mountedRef = useRef(true);
  // The path on the server once uploadFile has finished; null before that and after the job ends.
  const serverPathRef = useRef<string | null>(null);
  const outcomeRef = useRef<'ok' | 'cancelled' | 'failed' | null>(null);

  function stopListening() {
    unsubRef.current?.();
    unsubRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runRef.current += 1;
      cancelRef.current?.();
      stopListening();
      // Leaving the screen mid-processing abandons the upload: nobody will use the output.
      if (serverPathRef.current) {
        void cancelServerJob(serverPathRef.current);
        serverPathRef.current = null;
      }
    };
  }, []);

  function cancel() {
    // Past the upload, the server has the file: have it drop the output and the job.
    if (serverPathRef.current) {
      void cancelServerJob(serverPathRef.current);
      serverPathRef.current = null;
    }
    outcomeRef.current = 'cancelled';
    runRef.current += 1;
    cancelRef.current?.();
    cancelRef.current = null;
    stopListening();
    setStage('idle');
    setProgress(0);
    setSlow(false);
    setError(null);
    finishRef.current?.(null);
    finishRef.current = null;
  }

  async function uploadVideo(
    destination: 'portfolio' | 'chat-videos' | 'courses',
    userId: string,
    asset?: ImagePicker.ImagePickerAsset
  ): Promise<string | null> {
    stopListening();
    outcomeRef.current = null;
    serverPathRef.current = null;
    const run = ++runRef.current;
    const live = () => runRef.current === run && mountedRef.current;

    setUrl(null);
    setError(null);
    setSlow(false);
    setProgress(0);

    let picked: ImagePicker.ImagePickerAsset;
    if (asset) {
      picked = asset;
    } else {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'] as const,
        quality: 1,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        shouldDownloadFromNetwork: true,
      });
      if (result.canceled) return null;
      picked = result.assets[0];
    }
    const filePath = `${destination}/${userId}/${Date.now()}.mp4`;

    console.log('[useVideoUpload] started — filePath:', filePath);
    let blobUri: string;
    try {
      // Stage 1: shrink on the phone (≤1080p, ~4 Mbps). Falls back to the original on failure.
      setStage('compressing');
      const compression = startVideoCompression(picked.uri, picked, (p) => {
        if (live()) setProgress(p);
      });
      cancelRef.current = compression.cancel;
      blobUri = await compression.promise;

      // Stage 2: resumable upload with a percentage.
      if (!live()) return null;
      setStage('uploading');
      setProgress(0);
      const blob = await fetch(blobUri).then((r) => r.blob());
      if (!live()) return null;
      const control: { cancel?: () => void } = {};
      cancelRef.current = () => control.cancel?.();
      await uploadFile(
        filePath,
        blob,
        (p) => {
          if (live()) setProgress(Math.min(1, p.percentage / 100));
        },
        { contentType: 'video/mp4' },
        control
      );
    } catch (err) {
      cancelRef.current = null;
      // A cancel() bumped the run, so this is its aftermath, not a failure.
      if (!live() || err instanceof CompressionCancelled) return null;
      outcomeRef.current = 'failed';
      setStage('idle');
      setProgress(0);
      setError(err instanceof Error ? err.message : 'Upload failed');
      return null;
    }
    cancelRef.current = null;
    serverPathRef.current = filePath;
    // Cancelled in the instant the upload finished: the server has it now, so tell it to drop it.
    if (!live()) {
      serverPathRef.current = null;
      void cancelServerJob(filePath);
      return null;
    }

    // Stage 3: wait for compressVideo to write the job doc.
    setStage('processing');
    setProgress(0);

    // jobId must match the Cloud Function's computation exactly
    const jobId = btoa(filePath).replace(/[/+=]/g, '_');
    console.log('[useVideoUpload] upload complete — jobId:', jobId, '— waiting for Firestore job doc');

    return new Promise<string | null>((resolve) => {
      finishRef.current = resolve;
      const finish = (value: string | null) => {
        stopListening();
        finishRef.current = null;
        resolve(value);
      };

      // Not a failure: compressVideo can run for up to 540 s. Say so, and keep listening.
      timeoutRef.current = setTimeout(() => {
        if (live()) setSlow(true);
      }, VIDEO_PROCESSING_TIMEOUT_MS);

      unsubRef.current = onSnapshot(
        doc(db, 'videoJobs', jobId),
        (snap) => {
          if (!live() || !snap.exists()) return;
          const data = snap.data() as VideoJobStatus;
          console.log('[useVideoUpload] job change — jobId:', jobId, '— data:', JSON.stringify(data));

          if (data.status === 'done' && data.url) {
            outcomeRef.current = 'ok';
            serverPathRef.current = null;
            setStage('idle');
            setSlow(false);
            setUrl(data.url);
            finish(data.url);
          } else if (data.status === 'error') {
            outcomeRef.current = 'failed';
            serverPathRef.current = null;
            setStage('idle');
            setSlow(false);
            setError(data.error ?? 'Video processing failed');
            finish(null);
          }
        },
        (err) => {
          if (!live()) return;
          outcomeRef.current = 'failed';
          setStage('idle');
          setSlow(false);
          setError(err.message);
          finish(null);
        }
      );
    });
  }

  return {
    stage,
    progress,
    slow,
    uploading: stage === 'compressing' || stage === 'uploading',
    processing: stage === 'processing',
    url,
    error,
    cancel,
    getOutcome: () => outcomeRef.current,
    uploadVideo,
  };
}

import { useState, useEffect, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { uploadFile } from '@core/firebase/storage';

const TIMEOUT_MS = 3 * 60 * 1000;

type VideoJobStatus = {
  status: 'processing' | 'done' | 'error';
  url?: string;
  error?: string;
};

export type UseVideoUploadResult = {
  uploading: boolean;
  processing: boolean;
  url: string | null;
  error: string | null;
  uploadVideo: (
    destination: 'portfolio' | 'chat-videos' | 'courses',
    userId: string,
    asset?: ImagePicker.ImagePickerAsset
  ) => Promise<string | null>;
};

export function useVideoUpload(): UseVideoUploadResult {
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unsubRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      unsubRef.current?.();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function uploadVideo(
    destination: 'portfolio' | 'chat-videos' | 'courses',
    userId: string,
    asset?: ImagePicker.ImagePickerAsset
  ): Promise<string | null> {
    unsubRef.current?.();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setUrl(null);
    setError(null);

    let uri: string;
    if (asset) {
      uri = asset.uri;
    } else {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'] as const,
        quality: 1,
        // A non-passthrough preset skips PHPicker's writeData fast-path (which streams the huge
        // full-size iCloud original and stalls the upload) and instead loads + transcodes to 720p.
        // loadVideoRepresentation auto-downloads iCloud-offloaded videos → also fixes PHPhotos 3164.
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      });
      if (result.canceled) return null;
      uri = result.assets[0].uri;
    }
    const filePath = `${destination}/${userId}/${Date.now()}.mp4`;

    console.log('[useVideoUpload] upload started — filePath:', filePath);
    setUploading(true);
    try {
      const blob = await fetch(uri).then((r) => r.blob());
      await uploadFile(filePath, blob, undefined, { contentType: 'video/mp4' });
    } catch (err) {
      setUploading(false);
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      return null;
    }

    setUploading(false);
    setProcessing(true);

    // jobId must match the Cloud Function's computation exactly
    const jobId = btoa(filePath).replace(/[/+=]/g, '_');
    console.log('[useVideoUpload] upload complete — jobId:', jobId, '— waiting for Firestore job doc');

    return new Promise<string | null>((resolve) => {
      timeoutRef.current = setTimeout(() => {
        console.log('[useVideoUpload] timeout — no completion after', TIMEOUT_MS / 1000, 's for jobId:', jobId);
        unsubRef.current?.();
        setProcessing(false);
        setError('Processing timed out');
        resolve(null);
      }, TIMEOUT_MS);

      unsubRef.current = onSnapshot(
        doc(db, 'videoJobs', jobId),
        (snap) => {
          if (!snap.exists()) {
            console.log('[useVideoUpload] Firestore doc does not exist yet for jobId:', jobId);
            return;
          }
          const data = snap.data() as VideoJobStatus;
          console.log('[useVideoUpload] Firestore change — jobId:', jobId, '— data:', JSON.stringify(data));

          if (data.status === 'done' && data.url) {
            console.log('[useVideoUpload] status done — final URL:', data.url);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            unsubRef.current?.();
            setProcessing(false);
            setUrl(data.url);
            resolve(data.url);
          } else if (data.status === 'error') {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            unsubRef.current?.();
            setProcessing(false);
            const msg = data.error ?? 'Video processing failed';
            setError(msg);
            resolve(null);
          }
        },
        (err) => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setProcessing(false);
          setError(err.message);
          resolve(null);
        }
      );
    });
  }

  return { uploading, processing, url, error, uploadVideo };
}

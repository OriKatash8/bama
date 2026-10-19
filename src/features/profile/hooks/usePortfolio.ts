import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { subscribeToCollection, setDocument, deleteDocument } from '@core/firebase/firestore';
import { uploadFile, deleteFile } from '@core/firebase/storage';
import { CAPTION_MAX_LENGTH, type MediaAsset } from '@core/types/media';

// A skipped caption and a whitespace-only one are the same thing: store null, so the
// viewer's `caption &&` check is the only rule anyone has to remember.
function normalizeCaption(caption: string | null | undefined): string | null {
  const trimmed = caption?.trim();
  return trimmed ? trimmed.slice(0, CAPTION_MAX_LENGTH) : null;
}

/** Lets the caller watch and cancel one photo upload. */
export type PhotoUploadOptions = {
  onProgress?: (fraction: number) => void;
  /** Filled with cancel(); after it, upload() resolves quietly and writes nothing. */
  control?: { cancel?: () => void; cancelled?: boolean };
};

export function usePortfolio() {
  const user = useAuthStore((s) => s.user);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToCollection<MediaAsset>(
      `users/${user.id}/portfolio`,
      (data) => {
        setAssets(data.sort((a, b) => b.uploadedAt.seconds - a.uploadedAt.seconds));
        setIsLoading(false);
      }
    );
    return unsub;
  }, [user?.id]);

  async function upload(uri: string, caption: string | null = null, opts: PhotoUploadOptions = {}): Promise<void> {
    if (!user) return;
    const control = opts.control ?? {};
    control.cancelled = false;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `portfolio/${user.id}/${id}`;
    const firestorePath = `users/${user.id}/portfolio/${id}`;
    console.log('[usePortfolio] uploading → Storage path:', storagePath);

    // Cancel before the Storage task exists just flips the flag; it is honoured below.
    control.cancel = () => { control.cancelled = true; };

    let blob: Blob;
    try {
      blob = await fetch(uri).then((r) => r.blob());
    } catch (fetchErr: any) {
      console.error('[usePortfolio] fetch blob failed — code:', fetchErr?.code, 'message:', fetchErr?.message);
      console.error('[usePortfolio] fetch full error:', fetchErr);
      throw fetchErr;
    }

    if (control.cancelled) return;

    let url: string;
    try {
      const task: { cancel?: () => void } = {};
      control.cancel = () => { control.cancelled = true; task.cancel?.(); };
      url = await uploadFile(
        storagePath,
        blob,
        (p) => opts.onProgress?.(Math.min(1, p.percentage / 100)),
        undefined,
        task
      );
      console.log('[usePortfolio] Storage upload succeeded, downloadURL:', url);
    } catch (uploadErr: any) {
      // A cancel() ends the task with storage/canceled: that is the user's choice, not a failure.
      if (control.cancelled) return;
      console.error('[usePortfolio] Storage upload failed — path:', storagePath, 'code:', uploadErr?.code, 'message:', uploadErr?.message);
      console.error('[usePortfolio] upload full error:', uploadErr);
      throw uploadErr;
    }

    // Cancelled just as the upload finished: nothing was written yet, so drop the file.
    if (control.cancelled) {
      await deleteFile(storagePath).catch(() => {});
      return;
    }

    const assetData = {
      url,
      thumbnailUrl: null as string | null,
      type: 'image' as const,
      caption: normalizeCaption(caption),
      uploadedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };
    try {
      console.log('[usePortfolio] writing → Firestore path:', firestorePath);
      await setDocument(firestorePath, assetData);
    } catch (e: any) {
      console.error('[usePortfolio] Firestore write failed — path:', firestorePath, 'code:', e?.code, 'message:', e?.message);
      console.error('[usePortfolio] Firestore full error:', e);
      await deleteFile(storagePath).catch(() => {});
      throw e;
    }
  }

  async function addVideoUrl(url: string, caption: string | null = null): Promise<void> {
    if (!user) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await setDocument(`users/${user.id}/portfolio/${id}`, {
      url,
      thumbnailUrl: null as string | null,
      type: 'video' as const,
      caption: normalizeCaption(caption),
      uploadedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    });
  }

  async function remove(assetId: string): Promise<void> {
    if (!user) return;
    // Delete Firestore record first so the subscription removes the tile immediately,
    // then best-effort delete the Storage blob.
    await deleteDocument(`users/${user.id}/portfolio/${assetId}`);
    await deleteFile(`portfolio/${user.id}/${assetId}`).catch(() => {});
  }

  return { assets, isLoading, upload, addVideoUrl, remove };
}

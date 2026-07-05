import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { subscribeToCollection, setDocument, deleteDocument } from '@core/firebase/firestore';
import { uploadFile, deleteFile } from '@core/firebase/storage';
import type { MediaAsset } from '@core/types/media';

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

  async function upload(uri: string): Promise<void> {
    if (!user) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `portfolio/${user.id}/${id}`;
    const firestorePath = `users/${user.id}/portfolio/${id}`;
    console.log('[usePortfolio] uploading → Storage path:', storagePath);

    let blob: Blob;
    try {
      blob = await fetch(uri).then((r) => r.blob());
    } catch (fetchErr: any) {
      console.error('[usePortfolio] fetch blob failed — code:', fetchErr?.code, 'message:', fetchErr?.message);
      console.error('[usePortfolio] fetch full error:', fetchErr);
      throw fetchErr;
    }

    let url: string;
    try {
      url = await uploadFile(storagePath, blob);
      console.log('[usePortfolio] Storage upload succeeded, downloadURL:', url);
    } catch (uploadErr: any) {
      console.error('[usePortfolio] Storage upload failed — path:', storagePath, 'code:', uploadErr?.code, 'message:', uploadErr?.message);
      console.error('[usePortfolio] upload full error:', uploadErr);
      throw uploadErr;
    }

    const assetData = {
      url,
      thumbnailUrl: null as string | null,
      type: 'image' as const,
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

  async function remove(assetId: string): Promise<void> {
    if (!user) return;
    // Delete Firestore record first so the subscription removes the tile immediately,
    // then best-effort delete the Storage blob.
    await deleteDocument(`users/${user.id}/portfolio/${assetId}`);
    await deleteFile(`portfolio/${user.id}/${assetId}`).catch(() => {});
  }

  return { assets, isLoading, upload, remove };
}

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
    const blob = await fetch(uri).then((r) => r.blob());
    const url = await uploadFile(storagePath, blob);
    const asset: MediaAsset = {
      id,
      url,
      thumbnailUrl: null,
      type: 'image',
      uploadedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };
    await setDocument(`users/${user.id}/portfolio/${id}`, asset);
  }

  async function remove(assetId: string): Promise<void> {
    if (!user) return;
    await deleteFile(`portfolio/${user.id}/${assetId}`);
    await deleteDocument(`users/${user.id}/portfolio/${assetId}`);
  }

  return { assets, isLoading, upload, remove };
}

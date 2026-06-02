import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { updateDocument, subscribeToDocument, mergeDocument } from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import type { ClientProfile } from '@core/types/user';

export function useClientProfile() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToDocument<ClientProfile>(
      `users/${user.id}/clientProfile/data`,
      (data) => setProfile(data)
    );
  }, [user?.id]);

  async function save(
    name: string,
    photoUri: string | null,
    companyName: string | null = null,
    bio: string | null = null
  ): Promise<void> {
    if (!user) return;
    setIsSaving(true);
    setError(null);
    try {
      let photoURL = user.photoURL;
      if (photoUri && photoUri !== user.photoURL) {
        const blob = await fetch(photoUri).then((r) => r.blob());
        photoURL = await uploadFile(`avatars/${user.id}`, blob);
      }
      await updateDocument(`users/${user.id}`, { displayName: name, photoURL });
      await mergeDocument(`users/${user.id}/clientProfile/data`, {
        userId: user.id,
        companyName,
        bio,
      });
      setUser({ ...user, displayName: name, photoURL });
    } catch (e: any) {
      setError(e.message ?? 'Failed to save profile');
      throw e;
    } finally {
      setIsSaving(false);
    }
  }

  return { user, profile, isSaving, error, save };
}

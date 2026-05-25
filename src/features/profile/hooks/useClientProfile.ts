import { useState } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { updateDocument } from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';

export function useClientProfile() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(name: string, photoUri: string | null): Promise<void> {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      let photoURL = user.photoURL;
      if (photoUri && photoUri !== user.photoURL) {
        const blob = await fetch(photoUri).then((r) => r.blob());
        photoURL = await uploadFile(`avatars/${user.id}`, blob);
      }
      await updateDocument(`users/${user.id}`, { displayName: name, photoURL });
      setUser({ ...user, displayName: name, photoURL });
    } catch (e: any) {
      setError(e.message ?? 'Failed to save profile');
    } finally {
      setIsLoading(false);
    }
  }

  return { user, isLoading, error, save };
}

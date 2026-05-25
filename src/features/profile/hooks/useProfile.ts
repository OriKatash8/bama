import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import {
  subscribeToDocument,
  updateDocument,
  mergeDocument,
  queryByField,
} from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import type { ProfessionalProfile } from '@core/types/user';
import type { MediaRole } from '@core/types/media';
import type { PriceEntry, Review } from '@core/types/project';

type SaveFields = {
  name: string;
  photoUri: string | null;
  roles: MediaRole[];
  bio: string;
  equipment: string[];
  priceList: PriceEntry[];
};

export function useProfile() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [profile, setProfile] = useState<ProfessionalProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToDocument<ProfessionalProfile>(
      `users/${user.id}/profile/data`,
      (data) => {
        setProfile(data);
        setIsLoading(false);
      }
    );
    queryByField<Review>('reviews', 'professionalId', user.id).then(setReviews);
    return unsub;
  }, [user?.id]);

  async function save({ name, photoUri, roles, bio, equipment, priceList }: SaveFields) {
    if (!user) return;
    setError(null);
    try {
      let photoURL = user.photoURL;
      if (photoUri && photoUri !== user.photoURL) {
        const blob = await fetch(photoUri).then((r) => r.blob());
        photoURL = await uploadFile(`avatars/${user.id}`, blob);
      }
      await updateDocument(`users/${user.id}`, { displayName: name, photoURL });
      await mergeDocument(`users/${user.id}/profile/data`, {
        roles,
        bio,
        equipment,
        priceList,
      });
      setUser({ ...user, displayName: name, photoURL });
    } catch (e: any) {
      setError(e.message ?? 'Failed to save profile');
    }
  }

  return { user, profile, reviews, isLoading, error, save };
}

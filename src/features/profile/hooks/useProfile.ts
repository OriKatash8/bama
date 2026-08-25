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
import type { PriceEntry, Review } from '@core/types/project';

type RoleSkill = { role: string; specializations: string[] };

type SaveFields = {
  name: string;
  photoUri: string | null;
  roleSkills: RoleSkill[];
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
  const [isSaving, setIsSaving] = useState(false);
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
    // One-shot fetch intentional: review submission is out of scope, so cards won't change
    // during a session. The profile sub-doc (rating/reviewCount) stays live-subscribed above.
    queryByField<Review>('reviews', 'professionalId', user.id)
      .then(setReviews)
      .catch((e: any) => setError(e.message ?? 'Failed to load reviews'));
    return unsub;
  }, [user?.id]);

  async function save({ name, photoUri, roleSkills, bio, equipment, priceList }: SaveFields) {
    if (!user) return;
    setError(null);
    setIsSaving(true);
    try {
      let photoURL = user.photoURL;
      if (photoUri && photoUri !== user.photoURL) {
        const avatarPath = `avatars/${user.id}`;
        console.log('[useProfile] uploading avatar → Storage path:', avatarPath);
        let blob: Blob;
        try {
          blob = await fetch(photoUri).then((r) => r.blob());
        } catch (fetchErr: any) {
          console.error('[useProfile] fetch blob failed — code:', fetchErr?.code, 'message:', fetchErr?.message);
          console.error('[useProfile] fetch full error:', fetchErr);
          throw fetchErr;
        }
        try {
          photoURL = await uploadFile(avatarPath, blob);
          console.log('[useProfile] avatar upload succeeded, downloadURL:', photoURL);
        } catch (uploadErr: any) {
          console.error('[useProfile] Storage upload failed — path:', avatarPath, 'code:', uploadErr?.code, 'message:', uploadErr?.message);
          console.error('[useProfile] upload full error:', uploadErr);
          throw uploadErr;
        }
      }
      console.log('[useProfile] writing users/${user.id}:', { displayName: name, photoURL });
      await updateDocument(`users/${user.id}`, { displayName: name, photoURL });
      await mergeDocument(`users/${user.id}/profile/data`, {
        roleSkills,
        bio,
        equipment,
        priceList,
        // Marks the profile complete once the minimum requirements are met.
        // The UI only enables Save when valid, so this writes true on a qualifying save.
        proProfileCompleted: name.trim().length > 0 && roleSkills.length > 0,
      });
      setUser({ ...user, displayName: name, photoURL });
    } catch (e: any) {
      console.error('[useProfile] save failed — code:', e?.code, 'message:', e?.message);
      console.error('[useProfile] full error:', e);
      setError(e.message ?? 'Failed to save profile');
      throw e;
    } finally {
      setIsSaving(false);
    }
  }

  async function updateAvailability(status: 'available' | 'busy') {
    if (!user) return;
    await mergeDocument(`users/${user.id}/profile/data`, { availability: status });
  }

  return { user, profile, reviews, isLoading, isSaving, error, save, updateAvailability };
}

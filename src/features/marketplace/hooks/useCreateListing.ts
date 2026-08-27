import { useState } from 'react';
import { addDocument } from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import { useAuthStore } from '@core/stores/authStore';
import type { MarketplaceListingType, ProductCondition } from '../types';

export type CreateListingInput = {
  type: MarketplaceListingType;
  productName: string;
  location: string;
  price: number;
  imageUri: string | null;
  condition?: ProductCondition | null;
  category?: string;
  subcategory?: string[];
  brand?: string;
};

export function useCreateListing() {
  const user = useAuthStore((s) => s.user);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function create(input: CreateListingInput) {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const docId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let imageUrl: string | null = null;
      if (input.imageUri) {
        const blob = await fetch(input.imageUri).then((r) => r.blob());
        imageUrl = await uploadFile(`marketplace/${docId}/${Date.now()}`, blob);
      }
      await addDocument('marketplace_listings', {
        type: input.type,
        posterId: user.id,
        posterName: user.displayName,
        productName: input.productName,
        location: input.location,
        price: input.price,
        imageUrl,
        condition: input.condition ?? null,
        category: input.category || null,
        subcategory: input.subcategory && input.subcategory.length ? input.subcategory : null,
        brand: input.brand?.trim() || null,
        status: 'available',
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      });
    } catch (e) {
      throw e;  // let callers (PostListingSheet) show error toasts
    } finally {
      setIsSubmitting(false);
    }
  }

  return { create, isSubmitting };
}

import { useState } from 'react';
import { updateDocument } from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import type { MarketplaceListing } from '../types';
import type { CreateListingInput } from './useCreateListing';

export function useUpdateListing() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function update(
    listingId: string,
    original: MarketplaceListing,
    input: CreateListingInput,
  ) {
    setIsSubmitting(true);
    try {
      let imageUrl: string | null = original.imageUrl;
      if (input.imageUri == null) {
        imageUrl = null; // image removed
      } else if (input.imageUri !== original.imageUrl) {
        // a newly-picked local image → upload; unchanged remote URL is kept as-is
        const blob = await fetch(input.imageUri).then((r) => r.blob());
        imageUrl = await uploadFile(`marketplace/${listingId}/${Date.now()}`, blob);
      }
      await updateDocument(`marketplace_listings/${listingId}`, {
        type: input.type,
        productName: input.productName,
        location: input.location,
        price: input.price,
        imageUrl,
        condition: input.condition ?? null,
        category: input.category || null,
        subcategory: input.subcategory || null,
        brand: input.brand?.trim() || null,
      });
    } catch (e) {
      throw e; // let callers (PostListingSheet) show error toasts
    } finally {
      setIsSubmitting(false);
    }
  }

  return { update, isSubmitting };
}

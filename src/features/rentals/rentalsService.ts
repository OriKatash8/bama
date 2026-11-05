import { ref, uploadBytes } from 'firebase/storage';
import { callFunction } from '@core/firebase/functions';
import { storage } from '@core/firebase/config';

/**
 * The rental functions (functions/src/rentals). All of them are deployed to
 * europe-west1, so every call goes through the region-pinned instance — a call
 * on the default instance would look for them in us-central1 and get not-found.
 */
const REGION = 'europe-west1' as const;

export type SourceType = 'woocommerce' | 'shopify' | 'manual';

export type SaveCompanyInput = {
  companyId?: string;
  name: string;
  logoSourceUrl?: string | null;
  address?: string;
  city?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  sourceType: SourceType;
  sourceUrl?: string;
  /** ms since epoch, or null when not signed yet. */
  agreementSignedAt?: number | null;
};

export type SyncStats = {
  fetched: number;
  mapped: number;
  dropped: number;
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  imagesCopied: number;
  filesWritten: number;
  imageErrors: number;
  writes: number;
  durationMs: number;
};

/** A category the admin can assign: a BAMA category id or 'hidden'; null clears the admin's choice. */
export type Assignment = { itemId: string; category: string | null };

export const saveRentalCompany = (input: SaveCompanyInput) =>
  callFunction<SaveCompanyInput, { companyId: string }>('adminSaveRentalCompany', REGION)(input);

export const setRentalCompanyActive = (companyId: string, active: boolean) =>
  callFunction<{ companyId: string; active: boolean }, { writes: number }>('adminSetRentalCompanyActive', REGION)({ companyId, active });

export const setRentalCategoryMap = (companyId: string, categoryMap: Record<string, string>) =>
  callFunction<{ companyId: string; categoryMap: Record<string, string> }, { writes: number }>('adminSetRentalCategoryMap', REGION)({ companyId, categoryMap });

export const setRentalItemCategories = (assignments: Assignment[]) =>
  callFunction<{ assignments: Assignment[] }, { writes: number }>('adminSetRentalItemCategories', REGION)({ assignments });

export type DetectResult = {
  platform: SourceType;
  /** The store's address after same-site redirects (e.g. with www.), to save as its address. */
  storeUrl: string;
  /** `code` is translated on screen (admin_rental_companies.detect_code_*); `result` is the English fallback. */
  checked: { url: string; status: number | null; code?: string; result: string }[];
};

/** "Detect platform": the server asks the site (a browser would be stopped by CORS). Saves nothing. */
export const detectRentalPlatform = (url: string) =>
  callFunction<{ url: string }, DetectResult>('adminDetectRentalPlatform', REGION)({ url });

/** "Sync now". `force` applies a sync the mass-removal guard stopped. */
export const syncRentalCompany = (companyId: string, force = false) =>
  callFunction<{ companyId: string; force: boolean }, SyncStats>('adminSyncRentalCompany', REGION)({ companyId, force });

export const removeRentalCompany = (companyId: string) =>
  callFunction<{ companyId: string }, { writes: number }>('adminRemoveRentalCompany', REGION)({ companyId });

/** Counts a tap on "Rent through [company]". Never blocks opening the link. */
export const trackRentalClick = (itemId: string) =>
  callFunction<{ itemId: string }, { counted: boolean }>('trackRentalClick', REGION)({ itemId });

// ── manual companies: hand-entered items ──────────────────────────────────────

/** Where an item's image comes from: the admin's staged upload, or a URL. */
export type ManualImage = { uploadPath: string } | { url: string } | null;

export type SaveRentalItemInput = {
  companyId: string;
  /** Present when editing. */
  itemId?: string;
  name: string;
  /** ₪ per day; null = "price on request". */
  pricePerDay: number | null;
  category: string;
  description?: string;
  productUrl?: string | null;
  /** Omit to keep the current image; null removes it. */
  image?: ManualImage;
};

export const saveRentalItem = (input: SaveRentalItemInput) =>
  callFunction<SaveRentalItemInput, { itemId: string }>('adminSaveRentalItem', REGION)(input);

export const removeRentalItem = (itemId: string) =>
  callFunction<{ itemId: string }, { removed: boolean }>('adminRemoveRentalItem', REGION)({ itemId });

/**
 * Uploads a picked image to the admin's own staging folder (storage.rules:
 * rentalUploads/{uid}/…, create-only, images < 10 MB) and returns its path for
 * saveRentalItem, which turns it into the item's thumbnail + detail image and
 * deletes it. uploadBytes, not uploadFile: the folder is unreadable, so there is
 * no download URL to fetch — the function reads the file itself.
 */
export async function uploadRentalImage(uid: string, localUri: string): Promise<string> {
  const blob = await fetch(localUri).then((r) => r.blob());
  const path = `rentalUploads/${uid}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await uploadBytes(ref(storage, path), blob, { contentType: blob.type || 'image/jpeg' });
  return path;
}

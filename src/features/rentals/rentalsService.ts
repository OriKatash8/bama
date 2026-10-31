import { callFunction } from '@core/firebase/functions';

/**
 * The rental functions (functions/src/rentals). All of them are deployed to
 * europe-west1, so every call goes through the region-pinned instance — a call
 * on the default instance would look for them in us-central1 and get not-found.
 */
const REGION = 'europe-west1' as const;

export type SourceType = 'woocommerce' | 'manual';

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

/** "Sync now". `force` applies a sync the mass-removal guard stopped. */
export const syncRentalCompany = (companyId: string, force = false) =>
  callFunction<{ companyId: string; force: boolean }, SyncStats>('adminSyncRentalCompany', REGION)({ companyId, force });

export const removeRentalCompany = (companyId: string) =>
  callFunction<{ companyId: string }, { writes: number }>('adminRemoveRentalCompany', REGION)({ companyId });

/** Counts a tap on "Rent through [company]". Never blocks opening the link. */
export const trackRentalClick = (itemId: string) =>
  callFunction<{ itemId: string }, { counted: boolean }>('trackRentalClick', REGION)({ itemId });

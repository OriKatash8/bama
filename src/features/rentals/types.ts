import type { Timestamp } from '@core/types/common';

/**
 * The client's view of the documents functions/src/rentals writes. Read-only
 * here: every write goes through rentalsService (callables).
 */

export type SyncStatus = 'never' | 'running' | 'ok' | 'error';

export type RentalCompany = {
  id: string;
  name: string;
  logoUrl: string | null;
  logoSourceUrl: string | null;
  address: string;
  city: string;
  phone: string;
  whatsapp: string;
  website: string;
  sourceType: 'woocommerce' | 'manual';
  sourceUrl: string;
  active: boolean;
  removedAt: Timestamp | null;
  agreementSignedAt: Timestamp | null;
  categoryMap: Record<string, string>;
  externalCategories: { name: string; count: number }[];
  lastSyncAt: Timestamp | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  itemCount: number;
  visibleCount: number;
  unsortedCount: number;
  storageBytes: number;
  clicks: number;
};

export type RentalImage = { thumbUrl: string; url: string };

export type RentalItem = {
  id: string;
  companyId: string;
  companyName: string;
  companyCity: string;
  source: 'company';
  externalId: string;
  externalUrl: string;
  /** externalUrl with BAMA's UTM params — what "Rent through…" opens. */
  linkUrl: string;
  name: string;
  description: string;
  /** null = "price on request". */
  pricePerDay: number | null;
  salePrice: number | null;
  sortPrice: number;
  inStock: boolean;
  externalCategories: string[];
  category: string;
  suggestedCategory: string | null;
  manualCategory: string | null;
  active: boolean;
  visible: boolean;
  images: RentalImage[];
  clicks: number;
};

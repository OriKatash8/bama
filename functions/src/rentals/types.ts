import type { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { CategoryMap } from './resolve';
import type { StoredImage } from './images';

export type SourceType = 'woocommerce' | 'manual';
export type SyncStatus = 'never' | 'running' | 'ok' | 'error';

/** rentalCompanies/{companyId}. Written only by functions (rules deny every client write). */
export type RentalCompany = {
  name: string;
  logoUrl: string | null;
  logoSourceUrl: string | null;
  address: string;
  city: string;
  phone: string;
  whatsapp: string;
  website: string;
  sourceType: SourceType;
  sourceUrl: string;
  active: boolean;
  removedAt: Timestamp | null;
  agreementSignedAt: Timestamp | null;
  categoryMap: CategoryMap;
  /** Every external category seen in the last sync, with how many items carry it. */
  externalCategories: { name: string; count: number }[];
  lastSyncAt: Timestamp | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  syncLockUntil: Timestamp | null;
  lastSyncStats: SyncStats | null;
  /** Active items (shown or not). */
  itemCount: number;
  /** Active items users can see. */
  visibleCount: number;
  /** Active items waiting in "Needs sorting". */
  unsortedCount: number;
  /** Bytes of this company's images in Storage (thumbnails + detail images). */
  storageBytes: number;
  clicks: number;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
};

/** rentalItems/{companyId}_{externalId}. Never hard-deleted. */
export type RentalItem = {
  companyId: string;
  companyName: string;
  companyCity: string;
  source: 'company';
  externalId: string;
  externalUrl: string;
  /** externalUrl with BAMA's UTM params: what the app opens. */
  linkUrl: string;
  name: string;
  description: string;
  pricePerDay: number | null;
  salePrice: number | null;
  /** salePrice ?? pricePerDay, or NO_PRICE_SORT for "price on request". */
  sortPrice: number;
  inStock: boolean;
  externalCategories: string[];
  category: string;
  suggestedCategory: string | null;
  manualCategory: string | null;
  active: boolean;
  visible: boolean;
  images: StoredImage[];
  imageSources: string[];
  imagesHash: string | null;
  imageBytes: number;
  contentHash: string;
  searchKeys: string[];
  lastSeenAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  clicks: number;
};

export type SyncStats = {
  fetched: number;
  mapped: number;
  dropped: number;
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  imageCopies: number;
  imageErrors: number;
  /** Firestore document writes this sync made (items + the company doc). */
  writes: number;
  durationMs: number;
};

/** sortPrice for "price on request": after every real price in an ascending sort. */
export const NO_PRICE_SORT = 1_000_000_000;

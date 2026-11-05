import { isAssignableCategory } from './categories';
import {
  DESCRIPTION_MAX_CHARS, MANUAL_PRICE_MAX, NAME_MAX_CHARS, STAGING_PREFIX,
} from './config';
import { isPublicHttpsUrl } from './urls';
import type { MappedItem } from './woo';

/**
 * Hand-entered items of a 'manual' company (a shop with no store API — e.g. a
 * Wix site). They are ordinary rentalItems documents, built by the same helpers
 * as synced ones, so the rental tab, rules, search, filters and click counts
 * treat them exactly alike. This file is the pure half: validation and the
 * item's source fields; index.ts does the writes.
 */

/** Where the admin's image comes from: a file they uploaded to staging, or a URL. */
export type ManualImageInput = { uploadPath: string } | { url: string } | null;

export type ManualItemInput = {
  companyId: string;
  /** Present when editing; a new item gets a generated id. */
  itemId: string | null;
  name: string;
  /** Whole ₪ per day; null = "price on request". */
  pricePerDay: number | null;
  /** A BAMA category id or 'hidden' (never 'unsorted'). */
  category: string;
  description: string;
  productUrl: string | null;
  /** undefined = keep the current image (edit); null = no image. */
  image: ManualImageInput | undefined;
};

/** Thrown for invalid input; index.ts turns it into invalid-argument. */
export class ManualItemError extends Error {}

function text(v: unknown, field: string, { required, max }: { required: boolean; max: number }): string {
  if (v == null || v === '') {
    if (required) throw new ManualItemError(`${field} is required`);
    return '';
  }
  if (typeof v !== 'string') throw new ManualItemError(`${field} must be text`);
  const s = v.trim();
  if (required && !s) throw new ManualItemError(`${field} is required`);
  if (s.length > max) throw new ManualItemError(`${field} is too long`);
  return s;
}

/**
 * Validates what the admin sent — content, not just shape. `uid` is the caller:
 * an uploaded image must be in their own staging folder.
 */
export function parseManualItemInput(raw: unknown, uid: string): ManualItemInput {
  const d = (raw ?? {}) as Record<string, unknown>;
  const companyId = text(d.companyId, 'companyId', { required: true, max: 128 });
  if (!/^[A-Za-z0-9_-]+$/.test(companyId)) throw new ManualItemError('Bad companyId');

  let itemId: string | null = null;
  if (d.itemId != null && d.itemId !== '') {
    itemId = text(d.itemId, 'itemId', { required: true, max: 300 });
    // An item id is always "<companyId>_<externalId>": an edit cannot reach another company's item.
    if (!itemId.startsWith(`${companyId}_`) || itemId.includes('/')) throw new ManualItemError('Bad itemId');
  }

  const name = text(d.name, 'name', { required: true, max: NAME_MAX_CHARS });

  let pricePerDay: number | null = null;
  if (d.pricePerDay != null && d.pricePerDay !== '') {
    const n = typeof d.pricePerDay === 'number' ? d.pricePerDay : Number(d.pricePerDay);
    if (!Number.isFinite(n) || n < 1 || n > MANUAL_PRICE_MAX) {
      throw new ManualItemError(`pricePerDay must be between 1 and ${MANUAL_PRICE_MAX}, or empty`);
    }
    pricePerDay = Math.round(n * 100) / 100;
  }

  if (!isAssignableCategory(d.category)) throw new ManualItemError('Bad category');
  const category = d.category as string;

  const description = text(d.description, 'description', { required: false, max: DESCRIPTION_MAX_CHARS });

  const productUrlRaw = text(d.productUrl, 'productUrl', { required: false, max: 1000 });
  if (productUrlRaw && !isPublicHttpsUrl(productUrlRaw)) throw new ManualItemError('productUrl must be an https web address');

  let image: ManualImageInput | undefined;
  if (d.image === undefined) image = undefined;
  else if (d.image === null) image = null;
  else {
    const img = d.image as Record<string, unknown>;
    if (typeof img.uploadPath === 'string') {
      const own = `${STAGING_PREFIX}/${uid}/`;
      if (!img.uploadPath.startsWith(own) || img.uploadPath.includes('..') || img.uploadPath.length > 300) {
        throw new ManualItemError('The image must be your own upload');
      }
      image = { uploadPath: img.uploadPath };
    } else if (typeof img.url === 'string') {
      if (!isPublicHttpsUrl(img.url.trim())) throw new ManualItemError('The image URL must be an https web address');
      image = { url: img.url.trim() };
    } else {
      throw new ManualItemError('Bad image');
    }
  }

  return { companyId, itemId, name, pricePerDay, category, description, productUrl: productUrlRaw || null, image };
}

/**
 * The item as a MappedItem, so it gets its link, sort price, search keys and
 * content hash from the same helpers as a synced product. Its link is the
 * product URL, else the company's website.
 */
export function manualMappedItem(
  input: ManualItemInput,
  externalId: string,
  companyLink: string | null,
  imageSources: string[],
): MappedItem {
  const externalUrl = input.productUrl ?? companyLink;
  if (!externalUrl) throw new ManualItemError('Give the item a product URL, or the company a website');
  return {
    externalId,
    externalUrl,
    name: input.name,
    description: input.description,
    pricePerDay: input.pricePerDay,
    salePrice: null,
    inStock: true,
    externalCategories: [],
    imageSources,
  };
}

/** A new manual item's external id: short, sortable, unguessable enough to never collide. */
export function newManualExternalId(now = Date.now(), random = Math.random()): string {
  return `m${now.toString(36)}${Math.floor(random * 36 ** 6).toString(36).padStart(6, '0')}`;
}

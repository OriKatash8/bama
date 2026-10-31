import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { IMAGE_CONCURRENCY, SYNC_ERROR_MAX_CHARS, WRITE_BATCH_SIZE } from './config';
import { UNSORTED } from './categories';
import { copyImage, deletePrefix, mapLimit, type StoredImage } from './images';
import { suggestCategory } from './keywords';
import { withUtm } from './links';
import { isVisible, resolveCategory } from './resolve';
import { goneFromStore, isMassRemoval, MassRemovalError } from './removal';
import { searchKeys } from './search';
import { NO_PRICE_SORT, type RentalCompany, type RentalItem, type SyncStats } from './types';
import { contentHash, fetchAllProducts, imagesHash, mapWooProduct, storeHostOf, type MappedItem } from './woo';

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

/** How long a running sync holds its company before another may start. */
const SYNC_LOCK_MS = 15 * 60_000;

export const companiesCol = () => db.collection('rentalCompanies');
export const itemsCol = () => db.collection('rentalItems');
export const itemDocId = (companyId: string, externalId: string) => `${companyId}_${externalId}`;
export const companyStoragePrefix = (companyId: string) => `rentalCompanies/${companyId}`;
const itemStoragePrefix = (companyId: string, externalId: string) =>
  `${companyStoragePrefix(companyId)}/items/${externalId}`;

type Doc = admin.firestore.DocumentReference;
type Op = (b: admin.firestore.WriteBatch) => void;

/** Applies writes in batches of WRITE_BATCH_SIZE. Returns how many documents were written. */
export async function commitInBatches(ops: Op[]): Promise<number> {
  for (let i = 0; i < ops.length; i += WRITE_BATCH_SIZE) {
    const batch = db.batch();
    ops.slice(i, i + WRITE_BATCH_SIZE).forEach((op) => op(batch));
    await batch.commit();
  }
  return ops.length;
}

/** The item fields that follow from its company and its category — re-derived without a fetch. */
export function derivedFields(
  company: Pick<RentalCompany, 'name' | 'city' | 'active' | 'removedAt' | 'categoryMap'>,
  item: { externalCategories: string[]; manualCategory: string | null; active: boolean },
): Pick<RentalItem, 'companyName' | 'companyCity' | 'category' | 'visible'> {
  const category = resolveCategory({
    manualCategory: item.manualCategory,
    externalCategories: item.externalCategories,
    categoryMap: company.categoryMap,
  });
  return {
    companyName: company.name,
    companyCity: company.city,
    category,
    visible: isVisible({
      companyActive: company.active,
      companyRemoved: !!company.removedAt,
      itemActive: item.active,
      category,
    }),
  };
}

/** The fields that come from the store itself (all covered by contentHash). */
export function sourceFields(m: MappedItem): Pick<
  RentalItem,
  'externalId' | 'externalUrl' | 'linkUrl' | 'name' | 'description' | 'pricePerDay' | 'salePrice' | 'sortPrice'
  | 'inStock' | 'externalCategories' | 'imageSources' | 'contentHash' | 'searchKeys' | 'suggestedCategory'
> {
  return {
    externalId: m.externalId,
    externalUrl: m.externalUrl,
    linkUrl: withUtm(m.externalUrl),
    name: m.name,
    description: m.description,
    pricePerDay: m.pricePerDay,
    salePrice: m.salePrice,
    sortPrice: m.salePrice ?? m.pricePerDay ?? NO_PRICE_SORT,
    inStock: m.inStock,
    externalCategories: m.externalCategories,
    imageSources: m.imageSources,
    contentHash: contentHash(m),
    searchKeys: searchKeys(m.name),
    suggestedCategory: suggestCategory(m.name),
  };
}

const DERIVED_KEYS = ['companyName', 'companyCity', 'category', 'visible'] as const;

/** Only the derived fields that differ from what is stored; empty = nothing to write. */
export function derivedChanges(
  stored: Partial<RentalItem>,
  next: ReturnType<typeof derivedFields>,
): Partial<RentalItem> {
  const out: Partial<RentalItem> = {};
  for (const k of DERIVED_KEYS) {
    if (stored[k] !== next[k]) (out as Record<string, unknown>)[k] = next[k];
  }
  return out;
}

/** Counts kept on the company doc, from its items' current state. */
export function companyCounts(items: Pick<RentalItem, 'active' | 'visible' | 'category' | 'imageBytes'>[]) {
  let itemCount = 0, visibleCount = 0, unsortedCount = 0, storageBytes = 0;
  for (const it of items) {
    storageBytes += it.imageBytes ?? 0;
    if (!it.active) continue;
    itemCount++;
    if (it.visible) visibleCount++;
    if (it.category === UNSORTED) unsortedCount++;
  }
  return { itemCount, visibleCount, unsortedCount, storageBytes };
}

/** Takes the company's sync lock, or throws 'already-running'. */
async function acquireLock(ref: Doc): Promise<RentalCompany> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('not-found');
    const c = snap.data() as RentalCompany;
    if (c.removedAt) throw new Error('removed');
    const lock = c.syncLockUntil?.toMillis?.() ?? 0;
    if (c.syncStatus === 'running' && lock > Date.now()) throw new Error('already-running');
    tx.update(ref, {
      syncStatus: 'running',
      syncLockUntil: Timestamp.fromMillis(Date.now() + SYNC_LOCK_MS),
    });
    return c;
  });
}

/** Copies an item's images (only called when its image sources changed). */
async function copyItemImages(
  companyId: string,
  m: MappedItem,
  fetchFn: typeof fetch,
): Promise<{ images: StoredImage[]; bytes: number; errors: number; copied: number }> {
  const prefix = itemStoragePrefix(companyId, m.externalId);
  await deletePrefix(prefix);
  const images: StoredImage[] = [];
  let bytes = 0, errors = 0, copied = 0;
  for (let i = 0; i < m.imageSources.length; i++) {
    try {
      const r = await copyImage(m.imageSources[i], prefix, i, fetchFn);
      images.push(r.image);
      bytes += r.bytes;
      copied++;
    } catch (e) {
      errors++;
      console.warn(`[rentals] image ${m.imageSources[i]} for ${companyId}/${m.externalId}:`, (e as Error).message);
    }
  }
  return { images, bytes, errors, copied };
}

/**
 * Syncs one company from its store. Upserts by externalId, marks items the
 * store no longer lists inactive (never deletes), copies images only when their
 * source URLs changed, and writes a document ONLY when something differs — an
 * unchanged catalogue costs reads and no writes. manualCategory is never touched.
 *
 * lastSeenAt is therefore "last written while present in the store", not
 * "present in the latest sync": refreshing it on every item every sync would be
 * exactly the writes this avoids. The company's lastSyncAt says when the store
 * was last read in full.
 */
export async function syncRentalCompany(
  companyId: string,
  fetchFn: typeof fetch = fetch,
  { force = false }: { force?: boolean } = {},
): Promise<SyncStats> {
  const started = Date.now();
  const ref = companiesCol().doc(companyId);
  const company = await acquireLock(ref);
  try {
    if (company.sourceType !== 'woocommerce') throw new Error('This company is not synced from a store');
    const host = storeHostOf(company.sourceUrl);
    const products = await fetchAllProducts(company.sourceUrl, fetchFn);

    const mapped = new Map<string, MappedItem>();
    for (const p of products) {
      const m = mapWooProduct(p, host);
      if (m && !mapped.has(m.externalId)) mapped.set(m.externalId, m);
    }

    const existingSnap = await itemsCol().where('companyId', '==', companyId).get();
    const existing = new Map(existingSnap.docs.map((d) => [d.id, d.data() as RentalItem]));

    // Before any write or image copy: refuse a sync that would hide most of the catalogue.
    const gone = goneFromStore(existing, new Set([...mapped.keys()].map((e) => itemDocId(companyId, e))));
    const live = [...existing.values()].filter((it) => it.active).length;
    if (!force && isMassRemoval(gone.length, live)) {
      throw new MassRemovalError(
        `The store returned ${mapped.size} products; this would hide ${gone.length} of ${live} live items. ` +
        'Nothing was changed. Check the store, then use "Sync now" with force to apply it.',
      );
    }

    const stats: SyncStats = {
      fetched: products.length, mapped: mapped.size, dropped: products.length - mapped.size,
      created: 0, updated: 0, unchanged: 0, deactivated: 0, imagesCopied: 0, filesWritten: 0, imageErrors: 0,
      writes: 0, durationMs: 0,
    };
    const ops: Op[] = [];
    const finalState = new Map<string, Pick<RentalItem, 'active' | 'visible' | 'category' | 'imageBytes'>>();
    const externalCounts = new Map<string, number>();

    await mapLimit([...mapped.values()], IMAGE_CONCURRENCY, async (m) => {
      for (const c of new Set(m.externalCategories)) externalCounts.set(c, (externalCounts.get(c) ?? 0) + 1);
      const id = itemDocId(companyId, m.externalId);
      const stored = existing.get(id);
      const src = sourceFields(m);
      const manualCategory = stored?.manualCategory ?? null;
      const derived = derivedFields(company, { externalCategories: m.externalCategories, manualCategory, active: true });

      const wantImagesHash = imagesHash(m.imageSources);
      let imageUpdate: Partial<RentalItem> = {};
      let imageBytes = stored?.imageBytes ?? 0;
      if (stored?.imagesHash !== wantImagesHash) {
        const r = await copyItemImages(companyId, m, fetchFn);
        stats.imagesCopied += r.copied;
        stats.filesWritten += r.copied * 2;
        stats.imageErrors += r.errors;
        imageBytes = r.bytes;
        // A failed copy leaves imagesHash unset, so the next sync tries again.
        imageUpdate = { images: r.images, imageBytes, imagesHash: r.errors === 0 ? wantImagesHash : null };
      }
      finalState.set(id, { active: true, visible: derived.visible, category: derived.category, imageBytes });

      const docRef = itemsCol().doc(id);
      if (!stored) {
        const doc: RentalItem = {
          companyId, source: 'company', ...src, ...derived, manualCategory: null, active: true,
          images: [], imagesHash: null, imageBytes: 0, ...imageUpdate,
          lastSeenAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(), clicks: 0,
        };
        ops.push((b) => b.set(docRef, doc));
        stats.created++;
        return;
      }
      const sourceChanged = stored.contentHash !== src.contentHash || stored.suggestedCategory !== src.suggestedCategory;
      const changes: Partial<RentalItem> = {
        ...(sourceChanged ? src : {}),
        ...derivedChanges(stored, derived),
        ...(stored.active ? {} : { active: true }),
        ...imageUpdate,
      };
      if (Object.keys(changes).length === 0) { stats.unchanged++; return; }
      ops.push((b) => b.update(docRef, {
        ...changes, lastSeenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }));
      stats.updated++;
    });

    // Gone from the store: inactive, never deleted (a shared link must still resolve).
    for (const [id, stored] of existing) {
      if (!finalState.has(id)) {
        finalState.set(id, { active: false, visible: false, category: stored.category, imageBytes: stored.imageBytes ?? 0 });
      }
    }
    for (const id of gone) {
      ops.push((b) => b.update(itemsCol().doc(id), { active: false, visible: false, updatedAt: FieldValue.serverTimestamp() }));
      stats.deactivated++;
    }

    stats.writes = (await commitInBatches(ops)) + 1;
    stats.durationMs = Date.now() - started;
    await ref.update({
      ...companyCounts([...finalState.values()]),
      externalCategories: [...externalCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
      lastSyncAt: FieldValue.serverTimestamp(),
      lastSyncStats: stats,
      syncStatus: 'ok',
      syncError: null,
      syncLockUntil: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return stats;
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, SYNC_ERROR_MAX_CHARS);
    await ref.update({
      syncStatus: 'error', syncError: message, syncLockUntil: null, updatedAt: FieldValue.serverTimestamp(),
    });
    throw e;
  }
}

/**
 * Re-derives every item of a company from its CURRENT doc — after its
 * categoryMap, active flag, name or city changed — without reading the store.
 * Writes only items that change. Returns the number of item writes.
 */
export async function reapplyCompany(companyId: string): Promise<number> {
  const ref = companiesCol().doc(companyId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('not-found');
  const company = snap.data() as RentalCompany;
  const itemsSnap = await itemsCol().where('companyId', '==', companyId).get();
  const ops: Op[] = [];
  const state: Pick<RentalItem, 'active' | 'visible' | 'category' | 'imageBytes'>[] = [];
  for (const d of itemsSnap.docs) {
    const it = d.data() as RentalItem;
    const derived = derivedFields(company, it);
    state.push({ active: it.active, visible: derived.visible, category: derived.category, imageBytes: it.imageBytes ?? 0 });
    const changes = derivedChanges(it, derived);
    if (Object.keys(changes).length === 0) continue;
    ops.push((b) => b.update(d.ref, { ...changes, updatedAt: FieldValue.serverTimestamp() }));
  }
  const writes = await commitInBatches(ops);
  await ref.update({ ...companyCounts(state), updatedAt: FieldValue.serverTimestamp() });
  return writes;
}

/**
 * Sets (or, with null, clears) manualCategory on items, then re-derives them.
 * One call covers a single item, a bulk "set category" and "accept all suggestions".
 */
export async function assignCategories(assignments: { itemId: string; category: string | null }[]): Promise<number> {
  const refs = assignments.map((a) => itemsCol().doc(a.itemId));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const companies = new Map<string, RentalCompany>();
  const ops: Op[] = [];
  const touched = new Set<string>();
  for (let i = 0; i < snaps.length; i++) {
    const snap = snaps[i];
    if (!snap.exists) continue;
    const it = snap.data() as RentalItem;
    if (!companies.has(it.companyId)) {
      const c = await companiesCol().doc(it.companyId).get();
      if (!c.exists) continue;
      companies.set(it.companyId, c.data() as RentalCompany);
    }
    const manualCategory = assignments[i].category;
    const derived = derivedFields(companies.get(it.companyId)!, { ...it, manualCategory });
    ops.push((b) => b.update(snap.ref, { manualCategory, ...derived, updatedAt: FieldValue.serverTimestamp() }));
    touched.add(it.companyId);
  }
  const writes = await commitInBatches(ops);
  // Counts only; the items themselves are already right.
  for (const companyId of touched) await refreshCounts(companyId);
  return writes;
}

async function refreshCounts(companyId: string): Promise<void> {
  const snap = await itemsCol().where('companyId', '==', companyId).get();
  await companiesCol().doc(companyId).update({
    ...companyCounts(snap.docs.map((d) => d.data() as RentalItem)),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * "Remove company": inactive and marked removed (the scheduler skips it), every
 * item inactive and hidden with its images cleared, and every file under the
 * company's Storage folder (items and logo) deleted. No document is deleted.
 */
export async function removeCompany(companyId: string): Promise<number> {
  const ref = companiesCol().doc(companyId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('not-found');
  await ref.update({ active: false, removedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const itemsSnap = await itemsCol().where('companyId', '==', companyId).get();
  const writes = await commitInBatches(itemsSnap.docs.map((d) => (b) => b.update(d.ref, {
    active: false, visible: false, images: [], imagesHash: null, imageBytes: 0, updatedAt: FieldValue.serverTimestamp(),
  })));
  await deletePrefix(companyStoragePrefix(companyId));
  await ref.update({
    logoUrl: null, itemCount: 0, visibleCount: 0, unsortedCount: 0, storageBytes: 0,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return writes;
}

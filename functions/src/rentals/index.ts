import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { requireAdmin, requireAuth } from '../lifecycle/helpers';
import { SlidingWindowCounter } from '../communities/inviteCore';
import { CLICK_LIMIT_PER_WINDOW, CLICK_WINDOW_MS, RENTALS_REGION, SYNC_SCHEDULE, SYNC_TIMEZONE } from './config';
import { isAssignableCategory } from './categories';
import { copyImage, deletePrefix } from './images';
import {
  assignCategories, companiesCol, companyStoragePrefix, itemsCol, reapplyCompany, removeCompany, syncRentalCompany,
} from './sync';
import type { RentalCompany, RentalItem, SourceType } from './types';
import { storeHostOf } from './woo';
import { MassRemovalError } from './removal';

if (admin.apps.length === 0) admin.initializeApp();

/** Sync and image work: sharp needs the memory, a full catalogue needs the time. */
const HEAVY = { region: RENTALS_REGION, memory: '1GiB' as const, timeoutSeconds: 540 };
const LIGHT = { region: RENTALS_REGION };

const MAX_FIELD = 300;
const MAX_ASSIGNMENTS = 500;
const MAX_MAP_ENTRIES = 200;

function str(v: unknown, field: string, { required = false, max = MAX_FIELD } = {}): string {
  if (v == null || v === '') {
    if (required) throw new HttpsError('invalid-argument', `${field} is required`);
    return '';
  }
  if (typeof v !== 'string') throw new HttpsError('invalid-argument', `${field} must be text`);
  const s = v.trim();
  if (s.length > max) throw new HttpsError('invalid-argument', `${field} is too long`);
  if (required && !s) throw new HttpsError('invalid-argument', `${field} is required`);
  return s;
}

function httpsUrl(v: unknown, field: string, required = false): string {
  const s = str(v, field, { required, max: 1000 });
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
    return u.toString();
  } catch {
    throw new HttpsError('invalid-argument', `${field} must be a web address`);
  }
}

function companyId(v: unknown): string {
  const id = str(v, 'companyId', { required: true, max: 128 });
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new HttpsError('invalid-argument', 'Bad companyId');
  return id;
}

/** Turns an internal error into the code the admin screen shows. */
function asHttps(e: unknown): HttpsError {
  if (e instanceof HttpsError) return e;
  // The admin screen recognises this one and offers to apply the sync anyway (force).
  if (e instanceof MassRemovalError) return new HttpsError('failed-precondition', e.message, { reason: 'mass-removal' });
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === 'not-found') return new HttpsError('not-found', 'No such company');
  if (msg === 'already-running') return new HttpsError('failed-precondition', 'A sync is already running');
  if (msg === 'removed') return new HttpsError('failed-precondition', 'This company was removed');
  return new HttpsError('internal', msg.slice(0, 300));
}

/**
 * Create or edit a company. New companies start inactive (hidden from users
 * until an agreement is signed and the admin turns them on). A changed logo
 * URL is copied into Storage, so the app never loads a third-party host.
 */
export const adminSaveRentalCompany = onCall(HEAVY, async (request) => {
  requireAdmin(request.auth?.token);
  const d = (request.data ?? {}) as Record<string, unknown>;
  const sourceType: SourceType | null =
    d.sourceType === 'manual' ? 'manual' : d.sourceType === 'woocommerce' ? 'woocommerce' : null;
  if (!sourceType) throw new HttpsError('invalid-argument', 'sourceType must be woocommerce or manual');
  const sourceUrl = httpsUrl(d.sourceUrl, 'sourceUrl', sourceType === 'woocommerce');
  if (sourceUrl) storeHostOf(sourceUrl);
  const fields = {
    name: str(d.name, 'name', { required: true, max: 100 }),
    address: str(d.address, 'address'),
    city: str(d.city, 'city', { max: 100 }),
    phone: str(d.phone, 'phone', { max: 40 }),
    whatsapp: str(d.whatsapp, 'whatsapp', { max: 40 }),
    website: httpsUrl(d.website, 'website'),
    sourceType,
    sourceUrl,
    agreementSignedAt: typeof d.agreementSignedAt === 'number' && d.agreementSignedAt > 0
      ? Timestamp.fromMillis(d.agreementSignedAt) : null,
  };
  const logoSourceUrl = httpsUrl(d.logoSourceUrl, 'logoSourceUrl') || null;

  try {
    const id = d.companyId ? companyId(d.companyId) : companiesCol().doc().id;
    const ref = companiesCol().doc(id);
    const snap = await ref.get();
    const existing = snap.exists ? (snap.data() as RentalCompany) : null;
    if (d.companyId && !existing) throw new HttpsError('not-found', 'No such company');
    if (existing?.removedAt) throw new HttpsError('failed-precondition', 'This company was removed');

    let logo: Partial<Pick<RentalCompany, 'logoUrl' | 'logoSourceUrl'>> = {};
    if (logoSourceUrl !== (existing?.logoSourceUrl ?? null)) {
      await deletePrefix(`${companyStoragePrefix(id)}/logo`);
      logo = logoSourceUrl
        ? { logoUrl: (await copyImage(logoSourceUrl, `${companyStoragePrefix(id)}/logo`, 0)).image.thumbUrl, logoSourceUrl }
        : { logoUrl: null, logoSourceUrl: null };
    }

    if (!existing) {
      const doc: RentalCompany = {
        ...fields, logoUrl: logo.logoUrl ?? null, logoSourceUrl: logo.logoSourceUrl ?? null,
        active: false, removedAt: null, categoryMap: {}, externalCategories: [],
        lastSyncAt: null, syncStatus: 'never', syncError: null, syncLockUntil: null, lastSyncStats: null,
        itemCount: 0, visibleCount: 0, unsortedCount: 0, storageBytes: 0, clicks: 0,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      };
      await ref.set(doc);
    } else {
      await ref.update({ ...fields, ...logo, updatedAt: FieldValue.serverTimestamp() });
      // Items carry the company's name and city.
      if (existing.name !== fields.name || existing.city !== fields.city) await reapplyCompany(id);
    }
    return { companyId: id };
  } catch (e) {
    throw asHttps(e);
  }
});

/** Show or hide a company (and so every item of it) to users. */
export const adminSetRentalCompanyActive = onCall(LIGHT, async (request) => {
  requireAdmin(request.auth?.token);
  const id = companyId(request.data?.companyId);
  if (typeof request.data?.active !== 'boolean') throw new HttpsError('invalid-argument', 'active must be true or false');
  try {
    const ref = companiesCol().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('not-found');
    if ((snap.data() as RentalCompany).removedAt) throw new Error('removed');
    await ref.update({ active: request.data.active, updatedAt: FieldValue.serverTimestamp() });
    return { writes: await reapplyCompany(id) };
  } catch (e) {
    throw asHttps(e);
  }
});

/**
 * Replace a company's category map ({ external name: BAMA id | 'hidden' }) and
 * re-apply it to every item of the company — no store fetch.
 */
export const adminSetRentalCategoryMap = onCall(LIGHT, async (request) => {
  requireAdmin(request.auth?.token);
  const id = companyId(request.data?.companyId);
  const raw = request.data?.categoryMap;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpsError('invalid-argument', 'categoryMap must be an object');
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_MAP_ENTRIES) throw new HttpsError('invalid-argument', 'Too many categories');
  const categoryMap: Record<string, string> = {};
  for (const [ext, cat] of entries) {
    if (cat == null || cat === '') continue; // unmapped
    if (ext.length > MAX_FIELD || !isAssignableCategory(cat)) throw new HttpsError('invalid-argument', `Bad mapping for ${ext}`);
    categoryMap[ext] = cat;
  }
  try {
    await companiesCol().doc(id).update({ categoryMap, updatedAt: FieldValue.serverTimestamp() });
    return { writes: await reapplyCompany(id) };
  } catch (e) {
    throw asHttps(e);
  }
});

/** "Needs sorting": set (or clear, with null) the admin's category on one or many items. */
export const adminSetRentalItemCategories = onCall(LIGHT, async (request) => {
  requireAdmin(request.auth?.token);
  const list = request.data?.assignments;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_ASSIGNMENTS) {
    throw new HttpsError('invalid-argument', `assignments must be 1..${MAX_ASSIGNMENTS} items`);
  }
  const assignments = list.map((a: { itemId?: unknown; category?: unknown }) => {
    const itemId = str(a?.itemId, 'itemId', { required: true, max: 300 });
    if (itemId.includes('/')) throw new HttpsError('invalid-argument', 'Bad itemId');
    if (a.category !== null && !isAssignableCategory(a.category)) throw new HttpsError('invalid-argument', 'Bad category');
    return { itemId, category: (a.category as string | null) };
  });
  try {
    return { writes: await assignCategories(assignments) };
  } catch (e) {
    throw asHttps(e);
  }
});

/** "Sync now". `force` applies a sync the mass-removal guard stopped (see MAX_REMOVAL_FRACTION). */
export const adminSyncRentalCompany = onCall(HEAVY, async (request) => {
  requireAdmin(request.auth?.token);
  const id = companyId(request.data?.companyId);
  try {
    return await syncRentalCompany(id, fetch, { force: request.data?.force === true });
  } catch (e) {
    throw asHttps(e);
  }
});

/** "Remove company". Nothing is deleted from Firestore; its images are deleted from Storage. */
export const adminRemoveRentalCompany = onCall(HEAVY, async (request) => {
  requireAdmin(request.auth?.token);
  const id = companyId(request.data?.companyId);
  try {
    return { writes: await removeCompany(id) };
  } catch (e) {
    throw asHttps(e);
  }
});

/** Every store-synced company that is not removed, every SYNC_SCHEDULE. One failure never stops the rest. */
export const syncAllRentalCompanies = onSchedule(
  { schedule: SYNC_SCHEDULE, timeZone: SYNC_TIMEZONE, ...HEAVY },
  async () => {
    const snap = await companiesCol().where('sourceType', '==', 'woocommerce').get();
    for (const doc of snap.docs) {
      if ((doc.data() as RentalCompany).removedAt) continue;
      try {
        const stats = await syncRentalCompany(doc.id);
        console.log(`[rentals] synced ${doc.id}`, JSON.stringify(stats));
      } catch (e) {
        console.error(`[rentals] sync of ${doc.id} failed:`, (e as Error).message);
      }
    }
  },
);

/** Per-instance first pass: enough to stop a loop from inflating counts. */
const clickLimiter = new SlidingWindowCounter({ limit: CLICK_LIMIT_PER_WINDOW, windowMs: CLICK_WINDOW_MS, maxKeys: 5000 });

/**
 * Counts a tap on "Rent through [company]". Only an item users can see counts;
 * the client never writes counters itself.
 */
export const trackRentalClick = onCall(LIGHT, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const itemId = str(request.data?.itemId, 'itemId', { required: true, max: 300 });
  if (itemId.includes('/')) throw new HttpsError('invalid-argument', 'Bad itemId');
  if (!clickLimiter.hit(uid, Date.now())) return { counted: false };
  const snap = await itemsCol().doc(itemId).get();
  const item = snap.data() as RentalItem | undefined;
  if (!item?.visible) return { counted: false };
  const batch = admin.firestore().batch();
  batch.update(snap.ref, { clicks: FieldValue.increment(1) });
  batch.update(companiesCol().doc(item.companyId), { clicks: FieldValue.increment(1) });
  await batch.commit();
  return { counted: true };
});

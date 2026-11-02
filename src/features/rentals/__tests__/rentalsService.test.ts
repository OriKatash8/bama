const mockCallFunction = jest.fn((_name: string, _region?: string) => jest.fn(async () => ({})));
jest.mock('@core/firebase/functions', () => ({
  callFunction: (name: string, region?: string) => mockCallFunction(name, region),
}));

const mockUploadBytes = jest.fn(async () => ({}));
jest.mock('firebase/storage', () => ({
  ref: (_s: unknown, path: string) => ({ path }),
  uploadBytes: (r: { path: string }, b: unknown, m: unknown) => (mockUploadBytes as jest.Mock)(r, b, m),
}));
jest.mock('@core/firebase/config', () => ({ storage: {} }));

import * as svc from '../rentalsService';

describe('rentalsService', () => {
  beforeEach(() => mockCallFunction.mockClear());

  it.each([
    ['saveRentalCompany', 'adminSaveRentalCompany', () => svc.saveRentalCompany({ name: 'x', sourceType: 'manual' })],
    ['setRentalCompanyActive', 'adminSetRentalCompanyActive', () => svc.setRentalCompanyActive('c', true)],
    ['setRentalCategoryMap', 'adminSetRentalCategoryMap', () => svc.setRentalCategoryMap('c', {})],
    ['setRentalItemCategories', 'adminSetRentalItemCategories', () => svc.setRentalItemCategories([{ itemId: 'i', category: 'lens' }])],
    ['syncRentalCompany', 'adminSyncRentalCompany', () => svc.syncRentalCompany('c')],
    ['removeRentalCompany', 'adminRemoveRentalCompany', () => svc.removeRentalCompany('c')],
    ['trackRentalClick', 'trackRentalClick', () => svc.trackRentalClick('i')],
  ])('%s calls %s in europe-west1', async (_label, fn, call) => {
    await call();
    expect(mockCallFunction).toHaveBeenCalledWith(fn, 'europe-west1');
  });
});

describe('manual items', () => {
  beforeEach(() => mockCallFunction.mockClear());

  it.each([
    ['saveRentalItem', 'adminSaveRentalItem', () => svc.saveRentalItem({ companyId: 'c', name: 'x', pricePerDay: null, category: 'lens' })],
    ['removeRentalItem', 'adminRemoveRentalItem', () => svc.removeRentalItem('c_m1')],
  ])('%s calls %s in europe-west1', async (_label, fn, call) => {
    await call();
    expect(mockCallFunction).toHaveBeenCalledWith(fn, 'europe-west1');
  });
});

describe('uploadRentalImage', () => {
  it('uploads into the admin\'s own staging folder, with no download URL, and returns the path', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ blob: async () => ({ type: 'image/png' }) }));
    const path = await svc.uploadRentalImage('admin1', 'blob:local');
    expect(path).toMatch(/^rentalUploads\/admin1\/[a-z0-9]+-[a-z0-9]+$/);
    expect(mockUploadBytes).toHaveBeenCalledWith({ path }, { type: 'image/png' }, { contentType: 'image/png' });
  });
});

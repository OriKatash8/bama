const mockCallFunction = jest.fn((_name: string, _region?: string) => jest.fn(async () => ({})));
jest.mock('@core/firebase/functions', () => ({
  callFunction: (name: string, region?: string) => mockCallFunction(name, region),
}));

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

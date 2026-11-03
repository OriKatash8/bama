import { toPaymentMethodView } from '../paymentMethods';

jest.mock('../../lifecycle/helpers', () => ({ db: {}, FieldValue: {}, requireAuth: (u: string) => u }));
jest.mock('../../lifecycle/config', () => ({ readConfig: async () => ({}) }));
jest.mock('../../auth/verifiedEmail', () => ({ assertVerifiedEmail: () => undefined }));

const stored = {
  provider: 'fake', token: 'SECRET_TOKEN', last4: '4242', brand: 'visa', expMonth: 12, expYear: 2030,
  status: 'active', createdAt: 'x', updatedAt: 'y', invalidReason: 'nope',
};

describe('getMyPaymentMethod view', () => {
  it('never contains the token or any other stored field', () => {
    const view = toPaymentMethodView(stored, true);
    expect(JSON.stringify(view)).not.toContain('SECRET_TOKEN');
    expect(Object.keys(view).sort()).toEqual(
      ['brand', 'enabled', 'expMonth', 'expYear', 'hasCard', 'last4', 'status'],
    );
  });
  it('reports no card when none is stored', () => {
    expect(toPaymentMethodView(undefined, true)).toEqual({ enabled: true, hasCard: false });
  });
  it('carries enabled=false through untouched', () => {
    expect(toPaymentMethodView(undefined, false)).toEqual({ enabled: false, hasCard: false });
  });
  it('surfaces an invalidated card as such', () => {
    expect(toPaymentMethodView({ ...stored, status: 'invalid' }, true).status).toBe('invalid');
  });
});

describe('link mode view', () => {
  it('stays a plain card view unless linkMode is asked for (old clients unaffected)', () => {
    expect(toPaymentMethodView(undefined, false)).not.toHaveProperty('linkMode');
    expect(toPaymentMethodView(undefined, true)).not.toHaveProperty('linkMode');
  });
});


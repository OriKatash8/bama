import { LARGE_ENGAGEMENT_ABOVE, largeEngagementRows } from '../adminViews';

/**
 * The admin's "large projects" list: every engagement whose professional's own
 * amount is above ₪5,000, biggest first, with where its fee stands.
 */

const ts = (ms: number) => ({ toMillis: () => ms }) as never;
const fee = (id: string, over: Record<string, unknown>) => ({
  id,
  parentId: `p-${id}`,
  data: { professionalId: id, feeStatus: 'owed', feeRate: 0.03, baseAmount: 6000, slotActive: true, ...over } as never,
});

it('keeps only amounts above ₪5,000, biggest first', () => {
  expect(LARGE_ENGAGEMENT_ABOVE).toBe(5000);
  const rows = largeEngagementRows([
    fee('a', { baseAmount: 5000 }),   // exactly 5,000 is not above
    fee('b', { baseAmount: 12000 }),
    fee('c', { baseAmount: 4999 }),
    fee('d', { baseAmount: 5001 }),
  ]);
  expect(rows.map((r) => r.professionalId)).toEqual(['b', 'd']);
});

it('computes the fee and what is still owed of it', () => {
  const [pending] = largeEngagementRows([fee('a', { baseAmount: 10000 })]);
  expect(pending).toMatchObject({ projectId: 'p-a', fee: 300, outstanding: 300, feeState: 'pending', active: true });

  const [part] = largeEngagementRows([fee('a', { baseAmount: 10000, paidAmount: 100 })]);
  expect(part).toMatchObject({ fee: 300, outstanding: 200, feeState: 'pending' });
});

it('says where the fee stands: paid, disputed, not owed, exempt', () => {
  const state = (over: Record<string, unknown>) => largeEngagementRows([fee('a', over)])[0].feeState;
  expect(state({ feePaid: true })).toBe('paid');
  expect(state({ status: 'paid' })).toBe('paid');
  expect(state({ status: 'disputed' })).toBe('disputed');
  expect(state({ status: 'not_owed' })).toBe('not_owed');
  const exempt = largeEngagementRows([fee('a', { feeStatus: 'exempt' })])[0];
  expect(exempt).toMatchObject({ feeState: 'exempt', fee: 0, outstanding: 0 });
});

it('prefers the denormalised projectId and the hire time', () => {
  const [r] = largeEngagementRows([fee('a', { projectId: 'proj-1', hiredAt: ts(1000), slotActive: false })]);
  expect(r).toMatchObject({ projectId: 'proj-1', hiredAt: 1000, active: false });
});

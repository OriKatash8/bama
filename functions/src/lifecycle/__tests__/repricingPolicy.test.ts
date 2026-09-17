import { decideNewPriceRequest, roleKeyOf, sameRole } from '../priceRequestPolicy';

const client = (status: string, t: number) => ({ fromClient: true, status, createdAtMs: t });
const pro = (status: string, t: number) => ({ fromClient: false, status, createdAtMs: t });
const decide = (callerIsClient: boolean, underReview: boolean, history: ReturnType<typeof client>[]) =>
  decideNewPriceRequest({ callerIsClient, underReview, history });

describe('one pending request per role, either direction', () => {
  it('a pending client request blocks both sides', () => {
    expect(decide(true, true, [client('pending', 1)])).toEqual({ allowed: false, reason: 'price-change-pending' });
    expect(decide(false, true, [client('pending', 1)])).toEqual({ allowed: false, reason: 'price-change-pending' });
  });
  it('a pending professional request blocks both sides, also after review', () => {
    expect(decide(true, false, [pro('pending', 1)])).toEqual({ allowed: false, reason: 'price-change-pending' });
    expect(decide(false, false, [pro('pending', 1)])).toEqual({ allowed: false, reason: 'price-change-pending' });
  });
});

describe('the client', () => {
  it('may propose freely when nothing is pending', () => {
    expect(decide(true, true, [])).toEqual({ allowed: true });
    expect(decide(true, true, [client('rejected', 1), pro('rejected', 2), client('accepted', 3)])).toEqual({ allowed: true });
  });
});

describe('the professional, after review', () => {
  it('may reprice unprompted, as before', () => {
    expect(decide(false, false, [])).toEqual({ allowed: true });
    expect(decide(false, false, [pro('rejected', 1), pro('accepted', 2)])).toEqual({ allowed: true });
  });
});

describe('the professional, under review: counter only', () => {
  it('cannot open a negotiation', () => {
    expect(decide(false, true, [])).toEqual({ allowed: false, reason: 'counter-not-allowed' });
  });
  it('cannot counter a client proposal he ACCEPTED', () => {
    expect(decide(false, true, [client('accepted', 1)])).toEqual({ allowed: false, reason: 'counter-not-allowed' });
  });
  it('may counter a client proposal he REJECTED', () => {
    expect(decide(false, true, [client('rejected', 1)])).toEqual({ allowed: true });
  });
  it('counters once per client proposal', () => {
    expect(decide(false, true, [client('rejected', 1), pro('rejected', 2)]))
      .toEqual({ allowed: false, reason: 'counter-not-allowed' });
    expect(decide(false, true, [client('rejected', 1), pro('accepted', 2)]))
      .toEqual({ allowed: false, reason: 'counter-not-allowed' });
  });
  it('a NEW client proposal he rejects earns a new counter', () => {
    expect(decide(false, true, [client('rejected', 1), pro('rejected', 2), client('rejected', 3)]))
      .toEqual({ allowed: true });
  });
  it('orders by time, not by array position', () => {
    // Firestore returns documents in id order, not time order. Here the counter
    // (t=2) is listed BEFORE the client proposal it answered (t=1); read in array
    // order it would look like no counter had been made yet.
    expect(decide(false, true, [pro('rejected', 2), client('rejected', 1)]))
      .toEqual({ allowed: false, reason: 'counter-not-allowed' });
  });
  it("his own earlier requests (e.g. from before review) don't unlock a counter", () => {
    expect(decide(false, true, [pro('rejected', 1)])).toEqual({ allowed: false, reason: 'counter-not-allowed' });
  });
});

describe('role keys', () => {
  it('bundle beats category; neither is legacy', () => {
    expect(roleKeyOf({ bundleId: 'b1', category: 'Editor' })).toBe('bundle:b1');
    expect(roleKeyOf({ category: 'Editor' })).toBe('category:Editor');
    expect(roleKeyOf({})).toBe('legacy');
  });
  it('different roles are independent; legacy matches every role', () => {
    expect(sameRole('category:Editor', 'category:Sound Recordist')).toBe(false);
    expect(sameRole('category:Editor', 'bundle:b1')).toBe(false);
    expect(sameRole('category:Editor', 'category:Editor')).toBe(true);
    expect(sameRole('legacy', 'category:Editor')).toBe(true);
    expect(sameRole('bundle:b1', 'legacy')).toBe(true);
  });
});

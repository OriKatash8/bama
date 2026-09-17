import { decideNewPriceRequest, roleKeyOf, sameRole } from '../priceRequestPolicy';

const client = (status: string, t: number) => ({ fromClient: true, status, createdAtMs: t });
const pro = (status: string, t: number) => ({ fromClient: false, status, createdAtMs: t });
const decide = (callerIsClient: boolean, underReview: boolean, history: ReturnType<typeof client>[], proAccepted = false) =>
  decideNewPriceRequest({ callerIsClient, underReview, proAccepted, history });

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

describe('the professional, under review: one unprompted request per role', () => {
  it('may open ONE negotiation of his own', () => {
    expect(decide(false, true, [])).toEqual({ allowed: true });
  });
  it('the unprompted request is used once he has raised any request of his own — whatever the answer', () => {
    expect(decide(false, true, [pro('rejected', 1)])).toEqual({ allowed: false, reason: 'counter-not-allowed' });
    expect(decide(false, true, [pro('accepted', 1)])).toEqual({ allowed: false, reason: 'counter-not-allowed' });
  });
  it('a client proposal before he used it does not use it up', () => {
    expect(decide(false, true, [client('accepted', 1)])).toEqual({ allowed: true });
    expect(decide(false, true, [client('rejected', 1)])).toEqual({ allowed: true });
  });
  it('after his unprompted request the counter rule applies: a client proposal he rejects earns a counter', () => {
    expect(decide(false, true, [pro('rejected', 1), client('rejected', 2)])).toEqual({ allowed: true });
    expect(decide(false, true, [pro('rejected', 1), client('accepted', 2)]))
      .toEqual({ allowed: false, reason: 'counter-not-allowed' });
  });
  it('history is per role forever: an old request of his own still counts', () => {
    expect(decide(false, true, [pro('rejected', 1), client('rejected', 2), pro('rejected', 3)]))
      .toEqual({ allowed: false, reason: 'counter-not-allowed' });
  });
});

describe('the professional, under review, after his רלוונטי: counter only', () => {
  const acked = (history: ReturnType<typeof client>[]) => decide(false, true, history, true);

  it('can no longer open a negotiation, even with the unprompted request unused', () => {
    expect(acked([])).toEqual({ allowed: false, reason: 'counter-not-allowed' });
  });
  it('cannot counter a client proposal he ACCEPTED', () => {
    expect(acked([client('accepted', 1)])).toEqual({ allowed: false, reason: 'counter-not-allowed' });
  });
  it('may counter a client proposal he REJECTED', () => {
    expect(acked([client('rejected', 1)])).toEqual({ allowed: true });
  });
  it('counters once per client proposal', () => {
    expect(acked([client('rejected', 1), pro('rejected', 2)])).toEqual({ allowed: false, reason: 'counter-not-allowed' });
    expect(acked([client('rejected', 1), pro('accepted', 2)])).toEqual({ allowed: false, reason: 'counter-not-allowed' });
  });
  it('a NEW client proposal he rejects earns a new counter', () => {
    expect(acked([client('rejected', 1), pro('rejected', 2), client('rejected', 3)])).toEqual({ allowed: true });
  });
  it('orders by time, not by array position', () => {
    // Firestore returns documents in id order, not time order. Here the counter
    // (t=2) is listed BEFORE the client proposal it answered (t=1); read in array
    // order it would look like no counter had been made yet.
    expect(acked([pro('rejected', 2), client('rejected', 1)])).toEqual({ allowed: false, reason: 'counter-not-allowed' });
    expect(decide(false, true, [pro('rejected', 2), client('rejected', 1)]))
      .toEqual({ allowed: false, reason: 'counter-not-allowed' });
  });
});

describe('once the client has confirmed the role', () => {
  it('the professional reprices freely, acknowledged or not', () => {
    expect(decide(false, false, [pro('rejected', 1), pro('rejected', 2)], true)).toEqual({ allowed: true });
    expect(decide(false, false, [], false)).toEqual({ allowed: true });
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

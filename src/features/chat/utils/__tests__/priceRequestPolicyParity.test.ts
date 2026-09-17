import * as client from '../priceRequestPolicy';
import * as server from '../../../../../functions/src/lifecycle/priceRequestPolicy';

/**
 * The professional's card enables שינוי מחיר from the client mirror; the server
 * refuses from its own copy. If they ever disagree, the button taps into an
 * error. Every combination of the inputs up to three history items, both ways.
 */
const statuses = ['pending', 'accepted', 'rejected'];
const items: { fromClient: boolean; status: string }[] = [];
for (const fromClient of [true, false]) for (const status of statuses) items.push({ fromClient, status });

function* histories(max: number): Generator<{ fromClient: boolean; status: string; createdAtMs: number }[]> {
  yield [];
  function* grow(prefix: typeof items): Generator<typeof items> {
    if (prefix.length >= max) return;
    for (const it of items) {
      const next = [...prefix, it];
      yield next;
      yield* grow(next);
    }
  }
  for (const h of grow([])) {
    yield h.map((it, i) => ({ ...it, createdAtMs: i + 1 }));
    // Also out of array order, as Firestore returns by id.
    yield h.map((it, i) => ({ ...it, createdAtMs: h.length - i }));
  }
}

it('client mirror and server policy agree on every case', () => {
  let cases = 0;
  for (const history of histories(3)) {
    for (const callerIsClient of [true, false]) for (const underReview of [true, false]) for (const proAccepted of [true, false]) {
      const args = { callerIsClient, underReview, proAccepted, history };
      expect(client.decideNewPriceRequest(args)).toEqual(server.decideNewPriceRequest(args));
      cases++;
    }
  }
  expect(cases).toBeGreaterThan(1000);
});

it('role keys agree', () => {
  for (const req of [{ bundleId: 'b', category: 'Editor' }, { category: 'Editor' }, {}, { bundleId: '' }]) {
    expect(client.roleKeyOf(req)).toBe(server.roleKeyOf(req));
  }
  for (const [a, b] of [['legacy', 'category:x'], ['category:x', 'category:y'], ['bundle:b', 'bundle:b']]) {
    expect(client.sameRole(a, b)).toBe(server.sameRole(a, b));
  }
});

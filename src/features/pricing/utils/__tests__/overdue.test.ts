import { effectiveOverdueAt, feeIsOverdue, earliestOverdueAt } from '../overdue';
import * as server from '../../../../../functions/src/pricing';

/**
 * The client mirror of the overdue rule, run against the SERVER's copy on one
 * table. The server enforces; this only explains — but an explanation that
 * disagrees with the enforcement shows a blocked pro a clean screen, or a clean
 * pro a block.
 */

const T = Date.UTC(2026, 9, 2);
const DAY = 86400_000;

/** One fee, in both timestamp shapes: the client SDK's {seconds} and the Admin SDK's toMillis(). */
function both(over: Record<string, unknown>) {
  const base: Record<string, unknown> = {
    feeStatus: 'owed', status: 'pending', feePaid: false, feeDue: 30,
    engagementStatus: 'completed', overdueAt: T, chargeDueAt: T - 3 * DAY, ...over,
  };
  const client: Record<string, unknown> = { ...base };
  const srv: Record<string, unknown> = { ...base };
  for (const k of ['overdueAt', 'chargeDueAt']) {
    const ms = base[k] as number | undefined;
    client[k] = ms === undefined ? undefined : { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 };
    srv[k] = ms === undefined ? undefined : { toMillis: () => ms };
  }
  return { client: client as never, srv: srv as never };
}

const ROWS: [string, Record<string, unknown>][] = [
  ['a plain overdue fee', {}],
  ['contest window later than overdueAt', { chargeDueAt: T + 2 * DAY }],
  ['no overdueAt', { overdueAt: undefined }],
  ['no chargeDueAt', { chargeDueAt: undefined }],
  ['paid flag', { feePaid: true }],
  ['paid status', { status: 'paid' }],
  ['voided', { status: 'not_owed' }],
  ['nothing left', { feeDue: 0 }],
  ['exempt', { feeStatus: 'exempt' }],
  ['disputed', { engagementStatus: 'disputed' }],
  ['cancelled', { engagementStatus: 'cancelled' }],
  ['withdrawn', { engagementStatus: 'withdrawn' }],
  ['re-hired, still unpaid', { engagementStatus: 'hired' }],
];

describe.each(ROWS)('%s', (_label, over) => {
  const { client, srv } = both(over);
  it('has the same effective time on both sides', () => {
    expect(effectiveOverdueAt(client)).toBe(server.effectiveOverdueAt(srv));
  });
  it.each([T - 1, T, T + DAY, T + 3 * DAY])('agrees on overdue at %d', (now) => {
    expect(feeIsOverdue(client, now)).toBe(server.feeIsOverdue(srv, now));
  });
});

it('blockedFrom agrees across a mixed set', () => {
  const set = [{ overdueAt: T + 5 * DAY }, { overdueAt: T + 2 * DAY }, { overdueAt: T, engagementStatus: 'disputed' }, { feePaid: true }]
    .map(both);
  expect(earliestOverdueAt(set.map((s) => s.client))).toBe(T + 2 * DAY);
  expect(server.earliestOverdueAt(set.map((s) => s.srv))).toBe(T + 2 * DAY);
});

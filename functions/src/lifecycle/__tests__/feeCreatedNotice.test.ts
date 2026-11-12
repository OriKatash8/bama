import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { notifyFeeCreated, sendFeeNotice } from '../feeOverdue';
import { notify } from '../helpers';

/**
 * fee_created is ALWAYS sent when a fee is owed. With the block on it carries the
 * pay-by date; with it off (live config today) it says only what is owed, for
 * which project, and that it can be paid now — no date, no restriction wording.
 */

const mockDocs: Record<string, Record<string, unknown>> = {};

jest.mock('../helpers', () => ({
  db: { doc: (path: string) => ({ get: async () => ({ get: (k: string) => mockDocs[path]?.[k] }) }) },
  notify: jest.fn(),
  FieldValue: {},
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
}));

const notifyMock = notify as jest.Mock;
const sent = () => notifyMock.mock.calls[0][0] as { userId: string; message: string; data: { type: string; projectId: string } };
const BLOCK_AT = Date.UTC(2026, 10, 19, 12);
// Words that only belong in a message that threatens or describes a restriction.
const RESTRICTION_HE = /הגבל|חסימ|לא ניתן|מושה|להתקבל|הצעות/;
const RESTRICTION_EN = /block|restrict|paused|won't be able|offers|hired/i;

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockDocs)) delete mockDocs[k];
  mockDocs['projects/proj'] = { title: 'חתונה בתל אביב' };
});

it('block ON: sends fee_created with amount, project and the pay-by date', async () => {
  await expect(notifyFeeCreated('pro', 'proj', 30, BLOCK_AT)).resolves.toBe(true);
  const n = sent();
  expect(n.data).toEqual({ type: 'fee_created', projectId: 'proj' });
  expect(n.message).toContain('₪30');
  expect(n.message).toContain('"חתונה בתל אביב"');
  expect(n.message).toContain('19/11/2026');
});

it('block OFF (no date): STILL sends fee_created — amount + project + pay now, no date, no restriction', async () => {
  await expect(notifyFeeCreated('pro', 'proj', 30, undefined)).resolves.toBe(true);
  expect(notifyMock).toHaveBeenCalledTimes(1);
  const n = sent();
  expect(n.data.type).toBe('fee_created');          // same type: same routing, same "cannot mute"
  expect(n.message).toContain('₪30');
  expect(n.message).toContain('"חתונה בתל אביב"');
  expect(n.message).toContain('אפשר לשלם עכשיו');
  expect(n.message).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  expect(n.message).not.toMatch(RESTRICTION_HE);
});

it('block OFF in English: no date, no restriction wording, says pay now', async () => {
  mockDocs['users/pro'] = { language: 'en' };
  await notifyFeeCreated('pro', 'proj', 30, undefined);
  const n = sent();
  expect(n.message).toContain('₪30');
  expect(n.message).toContain('pay now');
  expect(n.message).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  expect(n.message).not.toMatch(RESTRICTION_EN);
});

it('falls back to a generic project word when the project has no title', async () => {
  delete mockDocs['projects/proj'];
  await notifyFeeCreated('pro', 'proj', 30, undefined);
  expect(sent().message).toContain('הפרויקט');
});

it('sends nothing for a fee with nothing owed', async () => {
  await expect(notifyFeeCreated('pro', 'proj', 0, BLOCK_AT)).resolves.toBe(false);
  await expect(notifyFeeCreated('pro', 'proj', 0, undefined)).resolves.toBe(false);
  expect(notifyMock).not.toHaveBeenCalled();
});

it('never throws: a failed push reports false so the caller falls back', async () => {
  notifyMock.mockRejectedValueOnce(new Error('fcm down'));
  await expect(notifyFeeCreated('pro', 'proj', 30, undefined)).resolves.toBe(false);
});

it('the dated notices cannot be built without a date', async () => {
  for (const kind of ['fee_created', 'fee_due', 'fee_overdue_soon', 'fee_overdue'] as const) {
    await expect(sendFeeNotice(kind, 'pro', 'proj', 30)).rejects.toThrow(/block date/);
  }
});

it('only the due / reminder / overdue notices talk about a restriction — never the creation push', async () => {
  const bodies: Record<string, string> = {};
  for (const kind of ['fee_created', 'fee_created_nodate', 'fee_due', 'fee_overdue_soon', 'fee_overdue'] as const) {
    notifyMock.mockClear();
    await sendFeeNotice(kind, 'pro', 'proj', 30, BLOCK_AT);
    bodies[kind] = sent().message;
  }
  expect(bodies.fee_created).not.toMatch(RESTRICTION_HE);
  expect(bodies.fee_created_nodate).not.toMatch(RESTRICTION_HE);
  expect(bodies.fee_overdue_soon).toMatch(RESTRICTION_HE);
  expect(bodies.fee_overdue).toMatch(RESTRICTION_HE);
});

describe('wiring: with the switch off nobody gets a threat, and everybody gets the fee push', () => {
  const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

  it('the hourly cron does nothing while the block switch is off (no due / reminder / overdue pushes)', () => {
    const cron = read('feeOverdue.ts');
    const body = cron.slice(cron.indexOf('export const feeOverdueCron'));
    expect(body).toMatch(/if \(!config\.feeOverdueBlockEnabled\) return;[\s\S]*runFeeOverdueSweep/);
  });

  it('both completion paths always call notifyFeeCreated, and keep the legacy push as a fallback', () => {
    const c = read('completion.ts');
    expect(c.match(/notifyFeeCreated\(/g)).toHaveLength(2);
    expect(c).toContain('if (owed && await notifyFeeCreated(');
  });

  it('a dispute resolved as completed notifies with the switch off too', () => {
    const d = read('disputeResolution.ts');
    expect(d).toContain("outcome === 'completed' && feeDue > 0");
    expect(d).toContain('notifyFeeCreated(proId, projectId, feeDue, undefined)');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { slotCapBlocksHire } from '../slotCap';

/**
 * SLOT CAP UNDER CONCURRENCY.
 *
 * The cap query used to run only before the hire transaction, so two hires of one
 * professional onto two different projects could both see "below the cap" and both
 * commit. The decision now has to come from a read taken inside the transaction,
 * before anything is written.
 */

describe('slotCapBlocksHire', () => {
  it('blocks when the in-transaction count is at the cap', async () => {
    await expect(slotCapBlocksHire({
      freshSlotHolders: [], proId: 'p', cap: 2, readCount: async () => 2,
    })).resolves.toBe(true);
  });

  it('allows below the cap', async () => {
    await expect(slotCapBlocksHire({
      freshSlotHolders: [], proId: 'p', cap: 2, readCount: async () => 1,
    })).resolves.toBe(false);
  });

  it('skips the count when the fresh project already holds this pro', async () => {
    const readCount = jest.fn(async () => 99);
    await expect(slotCapBlocksHire({
      freshSlotHolders: ['p'], proId: 'p', cap: 2, readCount,
    })).resolves.toBe(false);
    expect(readCount).not.toHaveBeenCalled();
  });

  it('re-reads the count on every call — a retry never reuses a stale number', async () => {
    // Firestore re-runs the whole transaction function on contention. Model the
    // concurrent winner landing between attempt 1 and attempt 2.
    let held = 1;
    const readCount = jest.fn(async () => held);
    const attempt = () => slotCapBlocksHire({ freshSlotHolders: [], proId: 'p', cap: 2, readCount });

    await expect(attempt()).resolves.toBe(false);
    held = 2;
    await expect(attempt()).resolves.toBe(true);
    expect(readCount).toHaveBeenCalledTimes(2);
  });
});

describe('commitHire wiring (structural)', () => {
  const SRC = readFileSync(join(__dirname, '..', 'hire.ts'), 'utf8');
  const body = SRC.slice(SRC.indexOf('db.runTransaction'));

  it('runs the cap query through the transaction, not through db', () => {
    const call = body.slice(body.indexOf('slotCapBlocksHire('));
    expect(call).toMatch(/readCount:[\s\S]*?tx\.get\(\s*db\.collection\('projects'\)[\s\S]*?array-contains/);
  });

  it('decides the cap from the FRESH project snapshot', () => {
    expect(body).toMatch(/freshSlotHolders:\s*fresh\.slotHolders/);
  });

  it('checks the cap before any transaction write', () => {
    const cap = body.indexOf('slotCapBlocksHire(');
    const firstWrite = body.search(/acceptWrites\(tx\)|tx\.(set|update)\(/);
    expect(cap).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(cap).toBeLessThan(firstWrite);
  });
});

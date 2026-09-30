import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { slotGuardBlocks } from '../slots';
import type { SlotUsage } from '../../services/slotsService';

/**
 * A slot is one PROJECT, not one role (server: hireConsumesNewSlot). A pro at
 * the cap who is already on a project can still take another role on it — the
 * noticeboard used to show "Your slots are full" there anyway.
 */

const usage = (ids: string[], cap = 2): SlotUsage => ({
  projects: ids.map((id) => ({ id }) as never),
  used: ids.length,
  cap,
  atCap: ids.length >= cap,
});

it('at the cap, a new project is blocked', () => {
  expect(slotGuardBlocks(usage(['a', 'b']), 'c')).toBe(true);
});

it('at the cap, a project the pro is already on is not — another role there takes no slot', () => {
  expect(slotGuardBlocks(usage(['a', 'b']), 'a')).toBe(false);
  expect(slotGuardBlocks(usage(['a', 'b']), 'b')).toBe(false);
});

it('under the cap, nothing is blocked', () => {
  expect(slotGuardBlocks(usage(['a']), 'c')).toBe(false);
});

it('usage not loaded yet: not blocked (the server still enforces the cap)', () => {
  expect(slotGuardBlocks(null, 'c')).toBe(false);
});

it('the noticeboard guard uses it, after the arrears check', () => {
  const src = readFileSync(join(__dirname, '..', '..', '..', '..', 'app', '(professional)', '(tabs)', 'dashboard', 'index.tsx'), 'utf8');
  const guard = src.slice(src.indexOf('function guardSlots('));
  expect(guard.indexOf('arrears.blocked')).toBeGreaterThan(-1);
  expect(guard.indexOf('slotGuardBlocks(slotUsage, request.id)')).toBeGreaterThan(guard.indexOf('arrears.blocked'));
});

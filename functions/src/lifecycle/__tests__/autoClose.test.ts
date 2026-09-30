/**
 * The end-date auto-close: an engagement closes AUTO_CLOSE_GRACE_DAYS (2) after
 * the project's end date, and when that finishes the project, its chat is closed
 * the same way the client's confirmation closes it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoCloseCutoff, autoCloseEngagement } from '../autoClose';
import { completeEngagementInternal } from '../completion';
import { closeProjectChatOnce } from '../chatClose';
import { notify } from '../helpers';
import { AUTO_CLOSE_GRACE_DAYS } from '../../pricing';

type Doc = Record<string, unknown>;
const mockStore = new Map<string, Doc>();

jest.mock('../helpers', () => ({
  db: { doc: (path: string) => ({ get: async () => ({ data: () => mockStore.get(path) }) }) },
  notify: jest.fn(),
}));
jest.mock('../completion', () => ({ completeEngagementInternal: jest.fn() }));
jest.mock('../chatClose', () => ({ closeProjectChatOnce: jest.fn() }));
jest.mock('../config', () => ({ readConfig: async () => ({ chargeWindowDays: 7 }) }));

const complete = completeEngagementInternal as jest.Mock;
const closeChat = closeProjectChatOnce as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  complete.mockResolvedValue({ completed: true });
});

it('the grace is 2 days', () => {
  expect(AUTO_CLOSE_GRACE_DAYS).toBe(2);
});

it('selects engagements whose end date is at least 2 days past', () => {
  const now = Date.UTC(2026, 9, 7, 3);
  expect(autoCloseCutoff(now).toMillis()).toBe(now - 2 * 86400_000);
});

it('the daily sweep selects by that cutoff, not by now', () => {
  const cron = readFileSync(join(__dirname, '..', 'cron.ts'), 'utf8');
  expect(cron).toMatch(/\.where\('completionDueAt', '<', autoCloseCutoff\(\)\)/);
  expect(cron).toMatch(/autoCloseEngagement\(/);
  expect(cron).not.toMatch(/\.where\('completionDueAt', '<', admin\.firestore\.Timestamp\.now\(\)\)/);
});

it('closes the chat when the auto-close finished the project', async () => {
  mockStore.set('projects/pr1', { status: 'completed', chatId: 'chat1' });
  await autoCloseEngagement('pr1', 'pro1');
  expect(complete).toHaveBeenCalledWith('pr1', 'pro1', 'auto');
  expect(closeChat).toHaveBeenCalledWith('chat1');
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'pro1' }));
});

it('leaves the chat open while another pro is still working', async () => {
  mockStore.set('projects/pr1', { status: 'in_progress', chatId: 'chat1' });
  await autoCloseEngagement('pr1', 'pro1');
  expect(closeChat).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalled();
});

it('does nothing more when the engagement was not closed', async () => {
  complete.mockResolvedValue({ completed: false, reason: 'already-terminal' });
  mockStore.set('projects/pr1', { status: 'completed', chatId: 'chat1' });
  await autoCloseEngagement('pr1', 'pro1');
  expect(closeChat).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
});

it('a project with no chat is fine', async () => {
  mockStore.set('projects/pr1', { status: 'completed' });
  await autoCloseEngagement('pr1', 'pro1');
  expect(closeChat).not.toHaveBeenCalled();
});

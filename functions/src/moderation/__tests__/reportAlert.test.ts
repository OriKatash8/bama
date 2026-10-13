const mockSets: { path: string; data: Record<string, unknown> }[] = [];
let mockUids: string[] = [];

jest.mock('firebase-admin', () => ({ apps: [{}], initializeApp: jest.fn() }));
jest.mock('firebase-functions/params', () => ({ defineList: () => ({ value: () => mockUids }) }));
jest.mock('../../lifecycle/helpers', () => ({
  FieldValue: { serverTimestamp: () => 'TS' },
  db: {
    collection: () => ({ doc: () => ({ path: `notifications/n${mockSets.length}` }) }),
    batch: () => ({
      set: (r: { path: string }, data: Record<string, unknown>) => { mockSets.push({ path: r.path, data }); },
      commit: async () => undefined,
    }),
  },
}));

import { alertText, onReportCreate } from '../reportAlert';

const fire = (data: Record<string, unknown>) =>
  (onReportCreate as unknown as { run: (e: unknown) => Promise<void> })
    .run({ data: { data: () => data }, params: { reportId: 'rep1' } });

beforeEach(() => { mockSets.length = 0; mockUids = ['admin1', 'admin2']; });

describe('onReportCreate', () => {
  it('notifies every configured admin, essential-type, pointing at the report', async () => {
    await fire({ type: 'user_blocked', reportedUserName: 'Bob' });
    expect(mockSets.map((s) => s.data.userId)).toEqual(['admin1', 'admin2']);
    expect(mockSets[0].data).toMatchObject({ title: 'User blocked', data: { type: 'admin_report', reportId: 'rep1' } });
  });

  it('does nothing (and does not throw) with no admins configured', async () => {
    mockUids = [];
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await fire({ reportedUserName: 'Bob' });
    expect(mockSets).toEqual([]);
  });

  it('words each kind of report', () => {
    expect(alertText({ reportedUserName: 'Bob', targetType: 'message' }).message).toContain('(message)');
    expect(alertText({ type: 'community_deletion' }).title).toMatch(/deletion/);
  });
});

let mockUids: string[] = [];
const mockNotes: Record<string, unknown>[] = [];
let mockFail = false;

jest.mock('firebase-functions/params', () => ({ defineList: () => ({ value: () => mockUids }) }));
jest.mock('firebase-functions/v2/firestore', () => ({ onDocumentCreated: () => undefined }));
jest.mock('../helpers', () => ({
  db: {
    doc: (path: string) => ({
      get: async () => ({ data: () => (path.startsWith('users/') ? { displayName: 'Dana' } : { title: 'Kitchen' }) }),
    }),
  },
  notify: async (n: Record<string, unknown>) => { if (mockFail) throw new Error('boom'); mockNotes.push(n); },
}));

import { disputeAlertText, notifyAdminsOfDispute } from '../disputeAlert';

beforeEach(() => { mockFail = false; mockNotes.length = 0; mockUids = ['a1', 'a2']; });

describe('notifyAdminsOfDispute', () => {
  it('pushes every admin, typed so a tap opens Reports → Disputes', async () => {
    await notifyAdminsOfDispute({ projectId: 'p1', proId: 'pro1', reason: 'didnt_happen' });
    expect(mockNotes.map((n) => n.userId)).toEqual(['a1', 'a2']);
    expect(mockNotes[0]).toMatchObject({
      data: { type: 'admin_dispute', projectId: 'p1', proId: 'pro1' },
      message: expect.stringContaining('Dana'),
    });
  });

  it('warns and does nothing with no admins configured', async () => {
    mockUids = [];
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await notifyAdminsOfDispute({ projectId: 'p1', proId: 'pro1', reason: 'amount_disputed' });
    expect(mockNotes).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('never throws', async () => {
    mockUids = ['a1'];
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFail = true;
    await expect(notifyAdminsOfDispute({ projectId: 'p1', proId: 'pro1', reason: 'didnt_happen' })).resolves.toBeUndefined();
    err.mockRestore();
  });

  it('words each reason', () => {
    expect(disputeAlertText({ reason: 'didnt_happen' }).message).toContain("didn't happen");
    expect(disputeAlertText({ reason: 'amount_disputed' }).message).toContain('fee amount');
  });
});

const mockSetDoc = jest.fn(async (_ref: unknown, _data: unknown) => undefined);
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  setDoc: (ref: unknown, data: unknown) => mockSetDoc(ref, data),
  serverTimestamp: () => 'SERVER_TS',
}));
jest.mock('@core/firebase/config', () => ({ db: {} }));

import { requestToJoinViaInvite } from '../joinViaInvite';

const TOKEN = 'A'.repeat(22);

beforeEach(() => mockSetDoc.mockClear());

describe('requestToJoinViaInvite', () => {
  it('writes the request under joinRequests/{uid} with EXACTLY the keys the rules allow', async () => {
    await requestToJoinViaInvite({ chatId: 'chat1', token: TOKEN, uid: 'u1', displayName: 'Dana' });
    const [ref, data] = mockSetDoc.mock.calls[0] as [string, Record<string, unknown>];
    expect(ref).toBe('chats/chat1/joinRequests/u1');
    expect(data).toEqual({
      userId: 'u1', displayName: 'Dana', requestedAt: 'SERVER_TS', status: 'pending', via: 'invite', inviteToken: TOKEN,
    });
    // firestore.rules isOwnPendingRequest: keys().hasOnly([...])
    const allowed = ['userId', 'displayName', 'requestedAt', 'status', 'via', 'inviteToken'];
    expect(Object.keys(data).every((k) => allowed.includes(k))).toBe(true);
  });

  it('refuses the 6-character short code: the rules want the long token', async () => {
    await expect(requestToJoinViaInvite({ chatId: 'c', token: 'K7MX9P', uid: 'u', displayName: '' })).rejects.toThrow(/22-character/);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('lets a Firestore refusal through for the screen to report', async () => {
    mockSetDoc.mockRejectedValueOnce({ code: 'permission-denied' });
    await expect(requestToJoinViaInvite({ chatId: 'c', token: TOKEN, uid: 'u', displayName: '' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

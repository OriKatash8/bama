const mockInner = jest.fn();
const mockCallFunction = jest.fn((_name: string, _region?: string) => mockInner);
jest.mock('@core/firebase/functions', () => ({ callFunction: (n: string, r?: string) => mockCallFunction(n, r) }));

import { createCommunityInvite, getCommunityInvite, revokeCommunityInvite } from '../inviteService';

beforeEach(() => { mockCallFunction.mockClear(); mockInner.mockReset(); });

describe('inviteService', () => {
  it('calls createCommunityInvite in europe-west1 with { communityId }', async () => {
    mockInner.mockResolvedValue({ token: 't', shortCode: 'ABC234', url: 'https://x/c/t' });
    await expect(createCommunityInvite('chat1')).resolves.toEqual({ token: 't', shortCode: 'ABC234', url: 'https://x/c/t' });
    expect(mockCallFunction).toHaveBeenCalledWith('createCommunityInvite', 'europe-west1');
    expect(mockInner).toHaveBeenCalledWith({ communityId: 'chat1' });
  });
  it('calls getCommunityInvite in europe-west1 with { tokenOrCode }', async () => {
    mockInner.mockResolvedValue({ exists: false });
    await getCommunityInvite('ABC234');
    expect(mockCallFunction).toHaveBeenCalledWith('getCommunityInvite', 'europe-west1');
    expect(mockInner).toHaveBeenCalledWith({ tokenOrCode: 'ABC234' });
  });
  it('calls revokeCommunityInvite in europe-west1 with { token }', async () => {
    mockInner.mockResolvedValue({});
    await revokeCommunityInvite('tok');
    expect(mockCallFunction).toHaveBeenCalledWith('revokeCommunityInvite', 'europe-west1');
    expect(mockInner).toHaveBeenCalledWith({ token: 'tok' });
  });
  it('lets the callable error through for inviteErrorKey to map', async () => {
    mockInner.mockRejectedValue({ code: 'functions/failed-precondition', message: 'email_not_verified' });
    await expect(createCommunityInvite('c')).rejects.toMatchObject({ message: 'email_not_verified' });
  });
});

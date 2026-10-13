const mockCall = jest.fn();
const mockDelete = jest.fn();

jest.mock('@core/firebase/functions', () => ({ callFunction: () => mockCall }));
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn((...a: unknown[]) => a.join('/')),
  deleteDoc: (...a: unknown[]) => mockDelete(...a),
  onSnapshot: jest.fn(),
}));

import { useBlockStore } from '@core/stores/blockStore';
import { blockUser, unblockUser } from '../blockService';

beforeEach(() => {
  mockCall.mockReset().mockResolvedValue({ success: true, alreadyBlocked: false });
  mockDelete.mockReset().mockResolvedValue(undefined);
  useBlockStore.setState({ blocked: [], loaded: true });
});

describe('blockService', () => {
  it('blocks through the callable (so the admin report is filed) and updates the store at once', async () => {
    await blockUser('alice', 'bob', { context: 'message', chatId: 'c1' });
    expect(mockCall).toHaveBeenCalledWith({ targetUid: 'bob', context: 'message', chatId: 'c1' });
    expect(useBlockStore.getState().blocked).toEqual(['bob']);
  });

  it('leaves the store alone when the callable fails', async () => {
    mockCall.mockRejectedValue(new Error('nope'));
    await expect(blockUser('alice', 'bob')).rejects.toThrow('nope');
    expect(useBlockStore.getState().blocked).toEqual([]);
  });

  it('never calls the server to block yourself', async () => {
    await blockUser('alice', 'alice');
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('unblocks with a delete and drops the user from the store at once', async () => {
    useBlockStore.setState({ blocked: ['bob', 'carol'] });
    await unblockUser('alice', 'bob');
    expect(mockDelete).toHaveBeenCalled();
    expect(useBlockStore.getState().blocked).toEqual(['carol']);
  });
});

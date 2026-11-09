import { createCommunityChat, updateCommunityCategories } from '../chatService';
import { updateDoc } from 'firebase/firestore';

/**
 * Every write that sets a community's categories also writes the legacy single
 * `category` (= categories[0]), so 1.0.x clients still show one, and the rules'
 * "no drift between the two" check passes.
 */

const mockSet = jest.fn();
const mockCommit = jest.fn(() => Promise.resolve());
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('../../../../core/firebase/config', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'chats'),
  doc: jest.fn((...args: unknown[]) => (args.length === 1 ? { id: 'new-chat' } : args.slice(1).join('/'))),
  writeBatch: jest.fn(() => ({ set: mockSet, commit: mockCommit })),
  serverTimestamp: jest.fn(() => 'TS'),
  updateDoc: jest.fn(() => Promise.resolve()),
}));
jest.mock('../communityMembership', () => ({
  logOwnerJoin: jest.fn(),
  withEvents: async (_label: string, fn: (events: null) => Promise<void>) => fn(null),
}));

beforeEach(() => jest.clearAllMocks());

describe('createCommunityChat', () => {
  it('writes the list and mirrors the first into `category`', async () => {
    await createCommunityChat('Sony shooters', 'd', 'o1', undefined, ['Video Photographer', 'Still Photographer']);
    const data = mockSet.mock.calls[0][1];
    expect(data.categories).toEqual(['Video Photographer', 'Still Photographer']);
    expect(data.category).toBe('Video Photographer');
  });

  it('puts them in role order whatever order they were picked in', async () => {
    await createCommunityChat('x', 'd', 'o1', undefined, ['Editor', 'Video Photographer']);
    const data = mockSet.mock.calls[0][1];
    expect(data.categories).toEqual(['Video Photographer', 'Editor']);
    expect(data.category).toBe('Video Photographer');
  });

  it('writes neither field when there are none (a 1.0.x request with no category)', async () => {
    await createCommunityChat('x', 'd', 'o1', undefined, []);
    const data = mockSet.mock.calls[0][1];
    expect(data).not.toHaveProperty('categories');
    expect(data).not.toHaveProperty('category');
  });
});

describe('updateCommunityCategories', () => {
  it('writes both fields in ONE update', async () => {
    await updateCommunityCategories('c1', ['Editor', 'Lighting Tech']);
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect((updateDoc as jest.Mock).mock.calls[0][1]).toEqual({
      categories: ['Editor', 'Lighting Tech'], category: 'Editor',
    });
  });

  it('refuses an empty selection', async () => {
    await expect(updateCommunityCategories('c1', [])).rejects.toThrow();
    await expect(updateCommunityCategories('c1', ['Wizard'])).rejects.toThrow();
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

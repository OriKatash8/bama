import { confirmReceived } from '../marketplaceService';

/**
 * A purchase ends when the buyer says the product reached them — in one press,
 * on one side. The seller used to have to confirm the handover too, which left
 * deals that were done in life sitting open in the app.
 */

// `mock`-prefixed, so jest allows the factories below to close over them.
const mockUpdates: { path: string; data: Record<string, unknown> }[] = [];
const mockCommit = jest.fn(async () => {});
const mockSent: unknown[] = [];

jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  writeBatch: () => ({
    update: (ref: { path: string }, data: Record<string, unknown>) => { mockUpdates.push({ path: ref.path, data }); },
    set: jest.fn(),
    commit: mockCommit,
  }),
  serverTimestamp: () => 'ts',
  collection: jest.fn(),
  deleteField: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  onSnapshot: jest.fn(),
  orderBy: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  arrayUnion: jest.fn(),
  arrayRemove: jest.fn(),
  increment: jest.fn(),
  limit: jest.fn(),
}));
jest.mock('@core/firebase/config', () => ({ db: {}, auth: {} }));
jest.mock('@core/firebase/storage', () => ({ deleteFile: jest.fn() }));
jest.mock('@features/chat/services/chatService', () => ({
  sendMessage: (...args: unknown[]) => { mockSent.push(args); return Promise.resolve(); },
  createPurchaseChat: jest.fn(),
}));

beforeEach(() => { mockUpdates.length = 0; mockSent.length = 0; mockCommit.mockClear(); });

it('sells the listing and closes the chat on the buyer s word alone', async () => {
  await confirmReceived('listing-1', 'chat-1', 'buyer-1', 'Purchase completed ✓');

  const listing = mockUpdates.find((u) => u.path === 'marketplace_listings/listing-1');
  expect(listing?.data.status).toBe('sold');
  expect(listing?.data.buyerConfirmed).toBe(true);

  const chat = mockUpdates.find((u) => u.path === 'chats/chat-1');
  expect(chat?.data).toMatchObject({ archived: true, archiveReason: 'completed' });

  expect(mockCommit).toHaveBeenCalledTimes(1);
  expect(mockSent).toHaveLength(1);
});

it('waits for nobody: no seller confirmation is read or written', async () => {
  await confirmReceived('listing-1', 'chat-1', 'buyer-1', 'done');
  const written = Object.keys(mockUpdates.find((u) => u.path === 'marketplace_listings/listing-1')?.data ?? {});
  expect(written).not.toContain('sellerConfirmed');
  expect(confirmReceived).toHaveLength(4); // no sellerAlreadyConfirmed argument
});

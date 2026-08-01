import { renderHook, act } from '@testing-library/react-native';
import { useAcceptOffer } from '../useAcceptOffer';
import { queryDocuments, runBatchUpdates, updateDocument, where } from '@core/firebase/firestore';

jest.mock('../../../chat/services/chatService', () => ({
  createProjectGroup: jest.fn(() => Promise.resolve('group1')),
  addMemberToGroup: jest.fn(() => Promise.resolve()),
}));

jest.mock('@core/firebase/firestore', () => ({
  queryDocuments: jest.fn(),
  runBatchUpdates: jest.fn(),
  updateDocument: jest.fn(),
  where: jest.fn(() => ({ type: 'where-constraint' })),
  arrayUnion: jest.fn((v) => v),
}));

const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockRunBatchUpdates = runBatchUpdates as jest.MockedFunction<typeof runBatchUpdates>;
const mockUpdateDocument = updateDocument as jest.MockedFunction<typeof updateDocument>;

const offer = {
  id: 'o1',
  projectId: 'proj1',
  professionalId: 'pro1',
  category: 'Video',
  subcategory: 'DP',
  price: 1000,
  status: 'pending' as const,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryDocuments.mockResolvedValue([]);
  mockRunBatchUpdates.mockResolvedValue(undefined);
  mockUpdateDocument.mockResolvedValue(undefined);
});

describe('useAcceptOffer', () => {
  it('accept: sets accepted offer status and updates project filledSlots', async () => {
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => { await result.current.accept(offer); });
    expect(mockUpdateDocument).toHaveBeenCalledWith(
      'priceOffers/o1',
      expect.objectContaining({ status: 'accepted' })
    );
    expect(mockUpdateDocument).toHaveBeenCalledWith(
      'projects/proj1',
      expect.objectContaining({
        filledSlots: expect.anything(),
      })
    );
  });

  it('accept: batch-rejects competing pending offers for the same slot', async () => {
    mockQueryDocuments.mockResolvedValue([
      { id: 'o2', projectId: 'proj1', professionalId: 'pro2', category: 'Video', subcategory: 'DP', price: 800, status: 'pending', createdAt: { seconds: 0, nanoseconds: 0 } },
    ]);
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => { await result.current.accept(offer); });
    expect(mockRunBatchUpdates).toHaveBeenCalledWith([
      { path: 'priceOffers/o2', data: { status: 'rejected' } },
    ]);
  });

  it('reject: sets offer status to rejected', async () => {
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => { await result.current.reject('o5'); });
    expect(mockUpdateDocument).toHaveBeenCalledWith('priceOffers/o5', { status: 'rejected' });
  });

  it('does not call runBatchUpdates when no competing offers', async () => {
    mockQueryDocuments.mockResolvedValue([]);
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => { await result.current.accept(offer); });
    expect(mockRunBatchUpdates).not.toHaveBeenCalled();
  });
});

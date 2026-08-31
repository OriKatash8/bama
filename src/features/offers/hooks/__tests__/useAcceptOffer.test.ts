import { renderHook, act } from '@testing-library/react-native';
import { useAcceptOffer } from '../useAcceptOffer';
import { updateDocument } from '@core/firebase/firestore';

// Accepting is now one server call. Competing-offer rejection, filledSlots and
// chat setup moved into the hireProfessional callable (functions/src/lifecycle/hire.ts),
// so the old step-by-step Firestore assertions no longer apply here.
const mockHire = jest.fn();

// The hook binds the callable at module load, so the factory must return a
// wrapper that dereferences mockHire lazily — at load time the const is still
// in its TDZ.
jest.mock('@core/firebase/functions', () => ({
  callFunction: jest.fn(() => (data: unknown) => mockHire(data)),
}));

jest.mock('@core/firebase/firestore', () => ({
  updateDocument: jest.fn(),
}));

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
  mockHire.mockResolvedValue({ chatId: 'group1' });
  mockUpdateDocument.mockResolvedValue(undefined);
});

describe('useAcceptOffer', () => {
  it('accept: delegates to hireProfessional with the offer id', async () => {
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => { await result.current.accept(offer); });
    expect(mockHire).toHaveBeenCalledWith({ offerId: 'o1' });
  });

  it('accept: writes nothing to Firestore directly', async () => {
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => { await result.current.accept(offer); });
    expect(mockUpdateDocument).not.toHaveBeenCalled();
  });

  it('accept: clears the in-flight id when the callable rejects', async () => {
    mockHire.mockRejectedValueOnce(new Error('slot-cap-reached'));
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => {
      await expect(result.current.accept(offer)).rejects.toThrow('slot-cap-reached');
    });
    expect(result.current.isAccepting).toBeNull();
  });

  it('reject: sets offer status to rejected', async () => {
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => { await result.current.reject('o5'); });
    expect(mockUpdateDocument).toHaveBeenCalledWith('priceOffers/o5', { status: 'rejected' });
  });
});

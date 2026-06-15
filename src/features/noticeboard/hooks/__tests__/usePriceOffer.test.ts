import { renderHook, act } from '@testing-library/react-native';
import { usePriceOffer } from '../usePriceOffer';
import { addDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  addDocument: jest.fn(),
}));

const mockAddDocument = addDocument as jest.MockedFunction<typeof addDocument>;

const mockUser = {
  id: 'pro1',
  email: 'pro@example.com',
  displayName: 'Pro User',
  photoURL: null,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, activeMode: 'professional', isLoading: false });
  mockAddDocument.mockResolvedValue('offer-id');
});

describe('usePriceOffer', () => {
  it('creates one priceOffer document per slot on submit', async () => {
    const { result } = renderHook(() => usePriceOffer());
    const slots = [
      { category: 'Video Production', subcategory: 'Cinematographer', price: 800 },
      { category: 'Audio', subcategory: 'Sound Mixer', price: 400 },
    ];
    await act(async () => {
      await result.current.submit('proj1', slots);
    });
    expect(mockAddDocument).toHaveBeenCalledTimes(2);
    expect(mockAddDocument).toHaveBeenCalledWith(
      'priceOffers',
      expect.objectContaining({
        projectId: 'proj1',
        professionalId: 'pro1',
        category: 'Video Production',
        subcategory: 'Cinematographer',
        price: 800,
        status: 'pending',
      })
    );
    expect(mockAddDocument).toHaveBeenCalledWith(
      'priceOffers',
      expect.objectContaining({
        projectId: 'proj1',
        professionalId: 'pro1',
        category: 'Audio',
        subcategory: 'Sound Mixer',
        price: 400,
        status: 'pending',
      })
    );
  });

  it('sets isSubmitting to true while in flight and false after', async () => {
    let resolve: () => void;
    mockAddDocument.mockReturnValue(new Promise<string>((r) => { resolve = () => r('id'); }));
    const { result } = renderHook(() => usePriceOffer());
    act(() => {
      result.current.submit('proj1', [{ category: 'Video', subcategory: 'DP', price: 500 }]);
    });
    expect(result.current.isSubmitting).toBe(true);
    await act(async () => { resolve!(); });
    expect(result.current.isSubmitting).toBe(false);
  });

  it('does nothing if no user', async () => {
    useAuthStore.setState({ user: null, activeMode: 'professional', isLoading: false });
    const { result } = renderHook(() => usePriceOffer());
    await act(async () => {
      await result.current.submit('proj1', [{ category: 'Video', subcategory: 'DP', price: 500 }]);
    });
    expect(mockAddDocument).not.toHaveBeenCalled();
  });
});

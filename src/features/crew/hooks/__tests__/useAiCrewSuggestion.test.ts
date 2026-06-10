import { renderHook, act } from '@testing-library/react-native';
import { useAiCrewSuggestion } from '../useAiCrewSuggestion';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_CLAUDE_API_KEY = 'test-key';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
});

describe('useAiCrewSuggestion', () => {
  it('calls Anthropic API and sets suggestion on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'You need 1 DP and 2 camera operators.' }] }),
    });

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('Music video shoot');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
      })
    );
    expect(result.current.suggestion).toBe('You need 1 DP and 2 camera operators.');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error on non-ok API response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('Wedding shoot');
    });

    expect(result.current.error).toBe('API error 401');
    expect(result.current.suggestion).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('Commercial shoot');
    });

    expect(result.current.error).toBe('Network failure');
    expect(result.current.isLoading).toBe(false);
  });

  it('does nothing when API key is absent', async () => {
    delete process.env.EXPO_PUBLIC_CLAUDE_API_KEY;

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('Test project');
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.suggestion).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('resets suggestion and error at start of a new call', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('First call');
    });
    expect(result.current.error).toBe('API error 500');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: 'Fresh suggestion' }] }),
    });
    await act(async () => {
      await result.current.suggest('Second call');
    });
    expect(result.current.error).toBeNull();
    expect(result.current.suggestion).toBe('Fresh suggestion');
  });
});

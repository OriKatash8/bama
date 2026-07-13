import { renderHook, act } from '@testing-library/react-native';
import { useAiCrewSuggestion } from '../useAiCrewSuggestion';

jest.mock('@core/services/aiService', () => ({
  callClaudeAI: jest.fn(),
}));

import { callClaudeAI } from '@core/services/aiService';
const mockCallClaudeAI = callClaudeAI as jest.MockedFunction<typeof callClaudeAI>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useAiCrewSuggestion', () => {
  it('calls callClaudeAI and sets suggestion on success', async () => {
    mockCallClaudeAI.mockResolvedValue('You need 1 DP and 2 camera operators.');

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('Music video shoot');
    });

    expect(mockCallClaudeAI).toHaveBeenCalledWith(
      expect.any(String),
      [{ role: 'user', content: 'Music video shoot' }],
      300,
    );
    expect(result.current.suggestion).toBe('You need 1 DP and 2 camera operators.');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error when callClaudeAI throws', async () => {
    mockCallClaudeAI.mockRejectedValue(new Error('API error 401'));

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('Wedding shoot');
    });

    expect(result.current.error).toBe('API error 401');
    expect(result.current.suggestion).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error on network failure', async () => {
    mockCallClaudeAI.mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('Commercial shoot');
    });

    expect(result.current.error).toBe('Network failure');
    expect(result.current.isLoading).toBe(false);
  });

  it('does nothing when description is empty', async () => {
    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('   ');
    });

    expect(mockCallClaudeAI).not.toHaveBeenCalled();
    expect(result.current.suggestion).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('resets suggestion and error at start of a new call', async () => {
    mockCallClaudeAI.mockRejectedValueOnce(new Error('API error 500'));

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('First call');
    });
    expect(result.current.error).toBe('API error 500');

    mockCallClaudeAI.mockResolvedValueOnce('Fresh suggestion');
    await act(async () => {
      await result.current.suggest('Second call');
    });
    expect(result.current.error).toBeNull();
    expect(result.current.suggestion).toBe('Fresh suggestion');
  });
});

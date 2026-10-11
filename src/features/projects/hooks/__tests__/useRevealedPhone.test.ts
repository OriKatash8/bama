import { renderHook, waitFor } from '@testing-library/react-native';
import { useRevealedPhone } from '../useRevealedPhone';

/**
 * The other side's contact on project details — asked for only when the viewer
 * can already tell it is allowed (the pro's part has ended). The server decides
 * for real; a refusal simply shows nothing. The phone wins; with none on file
 * the server may share the email instead.
 */

const mockGet = jest.fn();
jest.mock('@core/firebase/functions', () => ({ callFunction: () => (...a: unknown[]) => mockGet(...a) }));

beforeEach(() => mockGet.mockReset());

it('asks the server once eligible and returns the number', async () => {
  mockGet.mockResolvedValue({ phone: '+972501234567', email: null });
  const { result } = renderHook(() => useRevealedPhone('p1', 'pro1', true));
  await waitFor(() => expect(result.current).toEqual({ kind: 'phone', value: '+972501234567' }));
  expect(mockGet).toHaveBeenCalledWith({ projectId: 'p1', userId: 'pro1' });
});

it('no phone on file: returns the email the server shared', async () => {
  mockGet.mockResolvedValue({ phone: null, email: 'dana@example.com' });
  const { result } = renderHook(() => useRevealedPhone('p1', 'pro1', true));
  await waitFor(() => expect(result.current).toEqual({ kind: 'email', value: 'dana@example.com' }));
});

it('the phone wins if both ever come back', async () => {
  mockGet.mockResolvedValue({ phone: '+972501234567', email: 'dana@example.com' });
  const { result } = renderHook(() => useRevealedPhone('p1', 'pro1', true));
  await waitFor(() => expect(result.current).toEqual({ kind: 'phone', value: '+972501234567' }));
});

it('does not ask while the part is still open', async () => {
  const { result } = renderHook(() => useRevealedPhone('p1', 'pro1', false));
  await Promise.resolve();
  expect(mockGet).not.toHaveBeenCalled();
  expect(result.current).toBeNull();
});

it('a refusal, or someone with nothing to share, shows nothing', async () => {
  mockGet.mockRejectedValue(Object.assign(new Error('Not shared yet'), { code: 'functions/permission-denied' }));
  const refused = renderHook(() => useRevealedPhone('p1', 'pro1', true));
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  expect(refused.result.current).toBeNull();

  mockGet.mockResolvedValue({ phone: null, email: null });
  const none = renderHook(() => useRevealedPhone('p1', 'pro2', true));
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  expect(none.result.current).toBeNull();

  // An older server answers with the phone only.
  mockGet.mockResolvedValue({ phone: null });
  const legacy = renderHook(() => useRevealedPhone('p1', 'pro3', true));
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3));
  expect(legacy.result.current).toBeNull();
});

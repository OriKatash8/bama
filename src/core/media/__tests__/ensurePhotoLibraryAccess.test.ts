import { Platform } from 'react-native';

const mockGet = jest.fn();
const mockRequest = jest.fn();
jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: (...a: unknown[]) => mockGet(...a),
  requestMediaLibraryPermissionsAsync: (...a: unknown[]) => mockRequest(...a),
}));

import { ensurePhotoLibraryAccess } from '../ensurePhotoLibraryAccess';

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as { OS: string }).OS = 'ios';
  mockRequest.mockResolvedValue({ status: 'granted' });
});

it('asks once when access has never been decided', async () => {
  mockGet.mockResolvedValue({ status: 'undetermined' });
  await ensurePhotoLibraryAccess();
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

it.each(['granted', 'denied'])('does not ask again when it is already %s', async (status) => {
  mockGet.mockResolvedValue({ status });
  await ensurePhotoLibraryAccess();
  expect(mockRequest).not.toHaveBeenCalled();
});

it('resolves (never blocks the picker) when the user denies the prompt', async () => {
  mockGet.mockResolvedValue({ status: 'undetermined' });
  mockRequest.mockResolvedValue({ status: 'denied' });
  await expect(ensurePhotoLibraryAccess()).resolves.toBeUndefined();
});

it('resolves when the permission calls throw', async () => {
  mockGet.mockRejectedValue(new Error('native module missing'));
  await expect(ensurePhotoLibraryAccess()).resolves.toBeUndefined();
});

it('does nothing off iOS', async () => {
  (Platform as { OS: string }).OS = 'android';
  await ensurePhotoLibraryAccess();
  expect(mockGet).not.toHaveBeenCalled();
});

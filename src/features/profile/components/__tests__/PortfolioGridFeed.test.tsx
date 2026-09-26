import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PortfolioGrid } from '../PortfolioGrid';
import type { MediaAsset } from '@core/types/media';

/**
 * Tapping a portfolio item opens the Instagram-style FEED on that item — not the
 * one-per-page viewer, which is left to chat media.
 */

const mockFeed = jest.fn();
const mockViewer = jest.fn();
jest.mock('../PortfolioFeed', () => ({ PortfolioFeed: (p: Record<string, unknown>) => { mockFeed(p); return null; } }));
jest.mock('../PortfolioViewer', () => ({ PortfolioViewer: (p: Record<string, unknown>) => { mockViewer(p); return null; } }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(), VideoExportPreset: {} }));
jest.mock('expo-video', () => ({ useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn() }), VideoView: 'VideoView' }));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'u1' } }),
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/hooks/useVideoUpload', () => ({
  useVideoUpload: () => ({ uploading: false, processing: false, uploadVideo: jest.fn() }),
}));

const asset = (id: string): MediaAsset => ({
  id, url: `https://x/${id}`, type: 'image', thumbnailUrl: null, caption: null,
  uploadedAt: { seconds: 1, nanoseconds: 0 } as MediaAsset['uploadedAt'],
});
const ASSETS = [asset('a'), asset('b'), asset('c')];
const last = (m: jest.Mock) => m.mock.calls[m.mock.calls.length - 1][0];

beforeEach(() => jest.clearAllMocks());

it('opens the feed on the tapped item', () => {
  const r = render(<PortfolioGrid assets={ASSETS} isEditing={false} />);
  expect(last(mockFeed).visible).toBe(false);

  fireEvent.press(r.getByTestId('portfolio-tile-b'));

  expect(last(mockFeed)).toEqual(expect.objectContaining({ visible: true, initialIndex: 1, assets: ASSETS }));
});

it('never uses the one-per-page viewer', () => {
  const r = render(<PortfolioGrid assets={ASSETS} isEditing={false} />);
  fireEvent.press(r.getByTestId('portfolio-tile-a'));
  expect(mockViewer).not.toHaveBeenCalled();
});

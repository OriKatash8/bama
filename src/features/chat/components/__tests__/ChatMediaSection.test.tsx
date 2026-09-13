import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ChatMediaSection } from '../ChatMediaSection';
import { useChatMedia } from '../../hooks/useChatMedia';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * WhatsApp-style media on project details: a card with the count and the latest
 * four thumbnails, which opens a pop-up grid of every photo and video in the
 * project's chat; tapping one opens the full-screen viewer at that item.
 */

const mockViewer = jest.fn();
jest.mock('../../hooks/useChatMedia', () => ({ useChatMedia: jest.fn() }));
jest.mock('@features/profile/components/PortfolioViewer', () => ({
  PortfolioViewer: (props: Record<string, unknown>) => { mockViewer(props); return null; },
}));
jest.mock('@components/ui/VideoPlayer', () => ({ VideoPlayer: () => null }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
let mockLang: 'he' | 'en' = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));

const mockUseChatMedia = useChatMedia as jest.MockedFunction<typeof useChatMedia>;
const item = (i: number, type: 'image' | 'video' = 'image') => ({
  id: `m${i}`, url: `https://x/${i}`, type, thumbnailUrl: null, uploadedAt: { seconds: 100 - i, nanoseconds: 0 },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
});

it('renders nothing when the chat has no photos or videos', () => {
  mockUseChatMedia.mockReturnValue([]);
  const r = render(<ChatMediaSection chatId="c1" />);
  expect(r.toJSON()).toBeNull();
});

it('renders nothing without a chat id', () => {
  mockUseChatMedia.mockReturnValue([item(1)]);
  const r = render(<ChatMediaSection chatId={undefined} />);
  expect(r.toJSON()).toBeNull();
});

it('shows the title, the count and the latest four thumbnails', () => {
  mockUseChatMedia.mockReturnValue([item(1), item(2, 'video'), item(3), item(4), item(5), item(6)]);
  const r = render(<ChatMediaSection chatId="c1" />);
  expect(r.getByText(en.project_details.media)).toBeTruthy();
  expect(r.getByText('6')).toBeTruthy();
  expect(r.getAllByTestId(/^media-strip-m\d+$/).map((n) => n.props.testID)).toEqual([
    'media-strip-m1', 'media-strip-m2', 'media-strip-m3', 'media-strip-m4',
  ]);
  expect(r.getByTestId('media-strip-m2-play')).toBeTruthy();
});

it('opens a pop-up grid with every item, then the viewer at the tapped one', () => {
  const all = [item(1), item(2, 'video'), item(3), item(4), item(5), item(6)];
  mockUseChatMedia.mockReturnValue(all);
  const r = render(<ChatMediaSection chatId="c1" />);
  expect(r.queryByTestId('media-grid')).toBeNull();

  fireEvent.press(r.getByRole('button', { name: `${en.project_details.media} 6` }));
  expect(r.getAllByTestId(/^media-grid-item-m\d+$/)).toHaveLength(6);

  fireEvent.press(r.getByTestId('media-grid-item-m5'));
  const props = mockViewer.mock.calls[mockViewer.mock.calls.length - 1][0];
  expect(props.visible).toBe(true);
  expect(props.initialIndex).toBe(4);
  expect(props.assets).toEqual(all);

  props.onClose();
});

it('a thumbnail in the strip opens the viewer straight at that item', () => {
  const all = [item(1), item(2), item(3)];
  mockUseChatMedia.mockReturnValue(all);
  const r = render(<ChatMediaSection chatId="c1" />);
  fireEvent.press(r.getByTestId('media-strip-m3'));
  const props = mockViewer.mock.calls[mockViewer.mock.calls.length - 1][0];
  expect(props).toEqual(expect.objectContaining({ visible: true, initialIndex: 2 }));
});

it('closes the pop-up', () => {
  mockUseChatMedia.mockReturnValue([item(1)]);
  const r = render(<ChatMediaSection chatId="c1" />);
  fireEvent.press(r.getByRole('button', { name: `${en.project_details.media} 1` }));
  fireEvent.press(r.getByRole('button', { name: en.project_details.media_close }));
  expect(r.queryByTestId('media-grid')).toBeNull();
});

it('Hebrew: the header row runs right-to-left', () => {
  mockLang = 'he';
  mockUseChatMedia.mockReturnValue([item(1)]);
  const r = render(<ChatMediaSection chatId="c1" />);
  const header = r.getByTestId('media-header');
  expect([header.props.style].flat().find((s: { flexDirection?: string }) => s?.flexDirection)?.flexDirection).toBe('row-reverse');
  expect(r.getByText(he.project_details.media)).toBeTruthy();
});

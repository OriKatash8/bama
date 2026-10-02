import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { X } from 'lucide-react-native';
import { ChatMediaSection } from '../ChatMediaSection';
import { useChatMedia } from '../../hooks/useChatMedia';
import { useCommunityMedia } from '../../hooks/useCommunityMedia';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * WhatsApp-style media on project details: a one-line card with the title and the
 * count, and NO thumbnails on the page. The photos and videos only appear in the
 * pop-up grid it opens; tapping one opens the full-screen viewer at that item.
 */

const mockViewer = jest.fn();
jest.mock('../../hooks/useChatMedia', () => ({ useChatMedia: jest.fn() }));
jest.mock('../../hooks/useCommunityMedia', () => ({ useCommunityMedia: jest.fn(() => []) }));
jest.mock('@features/profile/components/PortfolioViewer', () => ({
  PortfolioViewer: (props: Record<string, unknown>) => { mockViewer(props); return null; },
}));
const mockVideo = jest.fn();
jest.mock('@components/ui/VideoPlayer', () => ({ VideoPlayer: (props: Record<string, unknown>) => { mockVideo(props); return null; } }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
let mockAccent = '#6D28D9';
jest.mock('@core/navigation/floatingTabBar', () => ({ useModeAccent: () => ({ accent: mockAccent, tint: '#fff' }) }));
let mockLang: 'he' | 'en' = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));

const mockUseChatMedia = useChatMedia as jest.MockedFunction<typeof useChatMedia>;
const item = (i: number, type: 'image' | 'video' = 'image') => ({
  id: `m${i}`, url: `https://x/${i}`, type, thumbnailUrl: null, caption: null, uploadedAt: { seconds: 100 - i, nanoseconds: 0 },
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

it('on the page: only the title and the count, no media items', () => {
  mockUseChatMedia.mockReturnValue([item(1), item(2, 'video'), item(3), item(4), item(5), item(6)]);
  const r = render(<ChatMediaSection chatId="c1" />);
  expect(r.getByText(en.project_details.media)).toBeTruthy();
  expect(r.getByText('6')).toBeTruthy();
  expect(r.queryAllByTestId(/^media-(strip|grid-item)-/)).toHaveLength(0);
  expect(mockViewer).not.toHaveBeenCalledWith(expect.objectContaining({ visible: true }));
});

it('opens a pop-up grid with every item, then the viewer at the tapped one', () => {
  const all = [item(1), item(2, 'video'), item(3), item(4), item(5), item(6)];
  mockUseChatMedia.mockReturnValue(all);
  const r = render(<ChatMediaSection chatId="c1" />);
  expect(r.queryByTestId('media-grid')).toBeNull();

  fireEvent.press(r.getByRole('button', { name: `${en.project_details.media} 6` }));
  expect(r.getAllByTestId(/^media-grid-item-m\d+$/)).toHaveLength(6);

  expect(r.getByTestId('media-grid-item-m2-play')).toBeTruthy();
  fireEvent.press(r.getByTestId('media-grid-item-m5'));
  const props = mockViewer.mock.calls[mockViewer.mock.calls.length - 1][0];
  expect(props.visible).toBe(true);
  expect(props.initialIndex).toBe(4);
  expect(props.assets).toEqual(all);

  props.onClose();
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

it('pop-up title: centred across the header line, a little lower than the old 52pt top', () => {
  mockUseChatMedia.mockReturnValue([item(1), item(2)]);
  const r = render(<ChatMediaSection chatId="c1" />);
  fireEvent.press(r.getByRole('button', { name: `${en.project_details.media} 2` }));
  const title = StyleSheet.flatten(r.getByTestId('media-grid-title').props.style);
  // Centred on the whole line, not squeezed beside the close button.
  expect(title).toEqual(expect.objectContaining({ position: 'absolute', left: 0, right: 0, textAlign: 'center' }));
  const screen = StyleSheet.flatten(r.getByTestId('media-grid').props.style);
  expect(screen.paddingTop).toBeGreaterThan(52);
});

describe('a community', () => {
  const mockUseCommunityMedia = useCommunityMedia as jest.MockedFunction<typeof useCommunityMedia>;

  it('reads its channels, not the chat\'s own messages', () => {
    mockUseChatMedia.mockReturnValue([]);
    mockUseCommunityMedia.mockReturnValue([item(1), item(2, 'video')]);

    const r = render(<ChatMediaSection chatId="c1" community />);

    expect(mockUseCommunityMedia).toHaveBeenLastCalledWith('c1');
    expect(mockUseChatMedia).toHaveBeenLastCalledWith(undefined);
    expect(r.getByTestId('media-header')).toBeTruthy();
    expect(r.getByText('2')).toBeTruthy();
  });

  it('takes a title colour; without one the title keeps its blue', () => {
    mockUseChatMedia.mockReturnValue([item(1)]);
    const title = (r: ReturnType<typeof render>) => StyleSheet.flatten(r.getByText(en.project_details.media).props.style);
    expect(title(render(<ChatMediaSection chatId="c1" />)).color).toBe('#004aad');
    expect(title(render(<ChatMediaSection chatId="c1" titleColor="#0f0f1f" />)).color).toBe('#0f0f1f');
  });

  it('the grid\'s title takes the same colour as the row; blue without one', () => {
    mockUseChatMedia.mockReturnValue([item(1)]);
    const gridTitle = (r: ReturnType<typeof render>) => {
      fireEvent.press(r.getByTestId('media-header'));
      return StyleSheet.flatten(r.getByTestId('media-grid-title').props.style);
    };
    expect(gridTitle(render(<ChatMediaSection chatId="c1" />)).color).toBe('#004aad');
    expect(gridTitle(render(<ChatMediaSection chatId="c1" titleColor="#000000" />)).color).toBe('#000000');
  });

  it('every grid cell is the same square: a video drops the player\'s own 180pt minimum, 16:9 ratio and corners', () => {
    // The player's defaults made video cells taller than photo cells, so rows of
    // mixed media came out uneven.
    mockUseChatMedia.mockReturnValue([item(1), item(2, 'video'), item(3)]);
    const r = render(<ChatMediaSection chatId="c1" />);
    fireEvent.press(r.getByTestId('media-header'));
    const video = StyleSheet.flatten(mockVideo.mock.calls[mockVideo.mock.calls.length - 1][0].style);
    const photo = StyleSheet.flatten(r.UNSAFE_getAllByType('Image' as never)[0].props.style);
    expect([video.width, video.height]).toEqual([photo.width, photo.height]);
    expect(video.width).toBe(video.height);
    expect([video.minHeight, video.aspectRatio, video.borderRadius]).toEqual([0, 1, 0]);
  });

  it('the grid\'s close (X) takes the mode colour: purple for a client, blue for a pro', () => {
    mockUseChatMedia.mockReturnValue([item(1)]);
    const closeColor = () => {
      const r = render(<ChatMediaSection chatId="c1" />);
      fireEvent.press(r.getByTestId('media-header'));
      return r.UNSAFE_getByType(X).props.color;
    };
    mockAccent = '#6D28D9';
    expect(closeColor()).toBe('#6D28D9');
    mockAccent = '#1D4ED8';
    expect(closeColor()).toBe('#1D4ED8');
  });

  it('a project chat does not listen to channels', () => {
    mockUseChatMedia.mockReturnValue([item(1)]);
    render(<ChatMediaSection chatId="c1" />);
    expect(mockUseCommunityMedia).toHaveBeenLastCalledWith(undefined);
    expect(mockUseChatMedia).toHaveBeenLastCalledWith('c1');
  });
});

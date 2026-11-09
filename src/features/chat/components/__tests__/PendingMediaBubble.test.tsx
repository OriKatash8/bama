import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PendingMediaBubble } from '../PendingMediaBubble';

jest.mock('@components/ui/VideoPlayer', () => ({ VideoPlayer: 'VideoPlayer' }));
jest.mock('lucide-react-native', () => ({ X: 'X' }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Circle: 'Circle' }));

const t = (k: string) => k;
const base = { type: 'image' as const, uri: 'file:///i.jpg', stage: 'uploading' as const, progress: 0.42, failed: false, onCancel: jest.fn(), onRetry: jest.fn(), t };

beforeEach(() => jest.clearAllMocks());

it('shows the stage with a percentage and a Cancel that works', () => {
  const r = render(<PendingMediaBubble {...base} />);
  expect(r.getByText('media.video_uploading 42%')).toBeTruthy();
  fireEvent.press(r.getByTestId('pending-cancel'));
  expect(base.onCancel).toHaveBeenCalled();
});

it('shows Retry and dismiss after a failure', () => {
  const r = render(<PendingMediaBubble {...base} failed />);
  expect(r.queryByTestId('pending-cancel')).toBeNull();
  fireEvent.press(r.getByTestId('pending-retry'));
  expect(base.onRetry).toHaveBeenCalled();
  fireEvent.press(r.getByTestId('pending-dismiss'));
  expect(base.onCancel).toHaveBeenCalled();
});

it('shows the local video through the player', () => {
  const r = render(<PendingMediaBubble {...base} type="video" stage="compressing" progress={0} />);
  expect(r.getByText('media.video_compressing')).toBeTruthy();
});

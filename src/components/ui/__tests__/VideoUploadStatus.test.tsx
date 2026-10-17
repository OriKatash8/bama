import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { VideoUploadStatus, videoStageLabel } from '../VideoUploadStatus';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

const mk = (tr: Record<string, unknown>) => (key: string) =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], tr) as string;
const tHe = mk(he);
const tEn = mk(en);
const base = { accent: '#00f', rtl: true, t: tHe };

it('labels each stage in Hebrew', () => {
  expect(videoStageLabel('compressing', 0, tHe)).toBe('מכווץ סרטון…');
  expect(videoStageLabel('compressing', 0.25, tHe)).toBe('מכווץ סרטון… 25%');
  expect(videoStageLabel('uploading', 0.42, tHe)).toBe('מעלה… 42%');
  expect(videoStageLabel('processing', 0, tHe)).toBe('מעבד…');
});

it('has English labels too', () => {
  expect(videoStageLabel('uploading', 0.5, tEn)).toBe('Uploading… 50%');
});

it('renders nothing when idle without error', () => {
  const { toJSON } = render(<VideoUploadStatus {...base} stage="idle" progress={0} />);
  expect(toJSON()).toBeNull();
});

it('shows the upload percentage, bar width and a working Cancel', () => {
  const onCancel = jest.fn();
  const { getByTestId } = render(<VideoUploadStatus {...base} stage="uploading" progress={0.42} onCancel={onCancel} />);
  expect(getByTestId('video-upload-label').props.children).toContain('42%');
  expect(getByTestId('video-upload-fill').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: '42%' })]));
  fireEvent.press(getByTestId('video-upload-cancel'));
  expect(onCancel).toHaveBeenCalled();
});

it('fills from the right in RTL (row-reverse track)', () => {
  const { getByTestId } = render(<VideoUploadStatus {...base} stage="uploading" progress={0.5} />);
  expect(StyleSheet.flatten(getByTestId('video-upload-track').props.style).flexDirection).toBe('row-reverse');
});

it('shows the "may still finish" notice (not an error) once slow', () => {
  const { getByTestId, queryByTestId } = render(<VideoUploadStatus {...base} stage="processing" progress={0} slow />);
  expect(getByTestId('video-upload-slow')).toBeTruthy();
  expect(queryByTestId('video-upload-error')).toBeNull();
});

it('shows the error with a Retry button', () => {
  const onRetry = jest.fn();
  const { getByTestId } = render(<VideoUploadStatus {...base} stage="idle" progress={0} error="x" onRetry={onRetry} />);
  fireEvent.press(getByTestId('video-upload-retry'));
  expect(onRetry).toHaveBeenCalled();
});

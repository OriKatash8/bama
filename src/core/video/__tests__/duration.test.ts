const mockConfirm = jest.fn();
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: (...a: unknown[]) => mockConfirm(...a) }));

import { Platform } from 'react-native';
import { ensureVideoWithinLimit, exceedsDuration, formatLimit, getVideoSeconds } from '../duration';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

const mk = (tr: Record<string, unknown>) => (key: string) =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], tr) as string;
const tHe = mk(he);
const tEn = mk(en);

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue(true);
  (Platform as { OS: string }).OS = 'ios';
});

it('reads the picker duration (ms) as seconds', async () => {
  expect(await getVideoSeconds({ uri: 'x', duration: 61_000 })).toBe(61);
});

it('is unknown on native when the picker gives no duration', async () => {
  expect(await getVideoSeconds({ uri: 'x', duration: null })).toBeNull();
});

it('exceedsDuration: 180 passes, 180.4 passes (tolerance), 181 fails, unknown passes', () => {
  expect(exceedsDuration(180, 180)).toBe(false);
  expect(exceedsDuration(180.4, 180)).toBe(false);
  expect(exceedsDuration(181, 180)).toBe(true);
  expect(exceedsDuration(null, 180)).toBe(false);
});

it('formats the limit in both languages', () => {
  expect(formatLimit(180, tHe)).toBe('3 דקות');
  expect(formatLimit(180, tEn)).toBe('3 minutes');
  expect(formatLimit(60, tHe)).toBe('דקה');
  expect(formatLimit(90, tEn)).toBe('90 seconds');
});

it('lets a short video through without a dialog', async () => {
  expect(await ensureVideoWithinLimit({ uri: 'x', duration: 120_000 }, 180, tHe)).toBe(true);
  expect(mockConfirm).not.toHaveBeenCalled();
});

it('refuses a 4 minute video with the friendly Hebrew message (confirmDialog, not Alert)', async () => {
  expect(await ensureVideoWithinLimit({ uri: 'x', duration: 240_000 }, 180, tHe)).toBe(false);
  const [title, body] = mockConfirm.mock.calls[0];
  expect(title).toBe('הסרטון ארוך מדי');
  expect(body).toContain('3 דקות');
  expect(body).not.toContain('{{');
});

it('lets an unknown-length native video through', async () => {
  expect(await ensureVideoWithinLimit({ uri: 'x' }, 180, tHe)).toBe(true);
});

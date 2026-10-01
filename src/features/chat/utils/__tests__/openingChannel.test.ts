import { openingChannelId } from '../openingChannel';

const strip = ['general', 'market', 'jobs'];

it('stays where it is when that channel has unread messages', () => {
  expect(openingChannelId(strip, 'general', { general: 2, jobs: 5 })).toBe('general');
});

it('moves to the first channel in strip order that has unread messages', () => {
  expect(openingChannelId(strip, 'general', { jobs: 1, market: 3 })).toBe('market');
});

it('stays put when nothing is unread', () => {
  expect(openingChannelId(strip, 'general', {})).toBe('general');
  expect(openingChannelId(strip, 'general', { general: 0, jobs: 0 })).toBe('general');
});

it('ignores counts for channels that no longer exist', () => {
  expect(openingChannelId(strip, 'general', { deleted: 4 })).toBe('general');
});

// A binary built before react-native-video-trim was added: requiring it throws.
jest.mock('react-native-video-trim', () => { throw new Error("TurboModuleRegistry.getEnforcing(...): 'VideoTrim' could not be found"); });

import { openVideoTrimmer } from '../trimVideo';

it('openVideoTrimmer resolves null instead of throwing when the module cannot be loaded', async () => {
  const labels = { done: 'D', cancel: 'C', working: 'W', failedTitle: 'T', failedBody: 'B', failedClose: 'X' };
  await expect(openVideoTrimmer('file:///in.mov', { labels, accent: '#000' })).resolves.toBeNull();
});

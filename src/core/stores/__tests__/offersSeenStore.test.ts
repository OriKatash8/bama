jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { useOffersSeenStore, unseenOfferCount, newestOfferMs } from '../offersSeenStore';

/**
 * "New" price offers are offers created after the last time this client OPENED the
 * price offers tab, tracked per device. The bottom Projects tab badge and the badge
 * on the "הצעות מחיר" pill both count with these helpers, so they always agree.
 */

const at = (seconds: number) => ({ createdAt: { seconds, nanoseconds: 0 } });

describe('unseenOfferCount', () => {
  it('counts offers created after the last seen moment (ms)', () => {
    expect(unseenOfferCount([at(10), at(20), at(30)], 20_000)).toBe(1);
    expect(unseenOfferCount([at(10), at(20), at(30)], 0)).toBe(3);
  });

  it('an offer at exactly the seen moment is already seen', () => {
    expect(unseenOfferCount([at(20)], 20_000)).toBe(0);
  });

  it('ignores offers with no createdAt yet', () => {
    expect(unseenOfferCount([{ createdAt: undefined }, at(5)], 0)).toBe(1);
  });
});

describe('newestOfferMs', () => {
  it('is the newest createdAt in ms, or 0 with none', () => {
    expect(newestOfferMs([at(10), at(30), at(20)])).toBe(30_000);
    expect(newestOfferMs([])).toBe(0);
  });
});

describe('markSeen', () => {
  beforeEach(() => useOffersSeenStore.setState({ lastSeenAt: {} }));

  it('only ever moves forward, per user', () => {
    const { markSeen } = useOffersSeenStore.getState();
    markSeen('u1', 30_000);
    markSeen('u1', 10_000);
    markSeen('u2', 5_000);
    expect(useOffersSeenStore.getState().lastSeenAt).toEqual({ u1: 30_000, u2: 5_000 });
  });
});

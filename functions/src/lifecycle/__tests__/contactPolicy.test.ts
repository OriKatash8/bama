import { canRevealPhone } from '../contactPolicy';

/**
 * A phone number is private. The other side of a project gets it only once the
 * professional's part has ENDED — completed, or completed and then contested —
 * and only between the client and that professional.
 */

const base = { clientId: 'client' };

describe('the client asking for a professional\'s number', () => {
  it.each(['completed', 'disputed'])('allowed once the pro\'s engagement is %s', (status) => {
    expect(canRevealPhone({ ...base, callerId: 'client', targetId: 'pro', proEngagementStatus: status })).toBe(true);
  });

  it.each(['hired', 'end_requested_by_pro', 'end_requested_by_client', 'withdrawn', 'cancelled', undefined])(
    'refused while it is %s', (status) => {
      expect(canRevealPhone({ ...base, callerId: 'client', targetId: 'pro', proEngagementStatus: status })).toBe(false);
    },
  );
});

describe('a professional asking for the client\'s number', () => {
  it('allowed once their OWN engagement has ended', () => {
    expect(canRevealPhone({ ...base, callerId: 'pro', targetId: 'client', proEngagementStatus: 'completed' })).toBe(true);
  });

  it('refused while their part is still open', () => {
    expect(canRevealPhone({ ...base, callerId: 'pro', targetId: 'client', proEngagementStatus: 'hired' })).toBe(false);
  });
});

describe('everyone else', () => {
  it('a professional never gets another professional\'s number', () => {
    expect(canRevealPhone({ ...base, callerId: 'pro', targetId: 'pro2', proEngagementStatus: 'completed' })).toBe(false);
  });

  it('asking for your own number through here is refused (it is in your own doc)', () => {
    expect(canRevealPhone({ ...base, callerId: 'client', targetId: 'client', proEngagementStatus: 'completed' })).toBe(false);
  });
});

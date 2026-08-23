jest.mock('@core/firebase/firestore', () => ({
  subscribeToCollection: jest.fn(),
  where: jest.fn(),
}));

import { getVacantSlots } from '../useNoticeboard';
import { professionalMatchesProject } from '@features/noticeboard/matching';
import type { ProjectRequest } from '@core/types/project';

function makeRequest(
  crewSlots: { category: string; quantity: number; requiredCapability?: string }[],
  filledSlots: { category: string; professionalId: string; requiredCapability?: string }[]
): ProjectRequest {
  return {
    id: 'proj1',
    clientId: 'client1',
    title: 'Test',
    description: '',
    deadline: '2026-07-01',
    location: 'NYC',
    status: 'open',
    createdAt: { seconds: 0, nanoseconds: 0 },
    crewSlots,
    filledSlots,
  };
}

describe('getVacantSlots', () => {
  it('returns all slots when none are filled', () => {
    const req = makeRequest([{ category: 'Editor', quantity: 2 }], []);
    expect(getVacantSlots(req)).toEqual([{ category: 'Editor', quantity: 2 }]);
  });

  it('reduces quantity by the number of filled entries for that slot', () => {
    const req = makeRequest(
      [{ category: 'Editor', quantity: 3 }],
      [
        { category: 'Editor', professionalId: 'pro1' },
        { category: 'Editor', professionalId: 'pro2' },
      ]
    );
    expect(getVacantSlots(req)).toEqual([{ category: 'Editor', quantity: 1 }]);
  });

  it('excludes a slot when it is fully filled', () => {
    const req = makeRequest(
      [{ category: 'Editor', quantity: 1 }],
      [{ category: 'Editor', professionalId: 'pro1' }]
    );
    expect(getVacantSlots(req)).toEqual([]);
  });

  it('mixing: a general fill only consumes the general slot, leaving the drone slot vacant', () => {
    const req = makeRequest(
      [
        { category: 'Video Photographer', quantity: 1, requiredCapability: 'drone' },
        { category: 'Video Photographer', quantity: 1 },
      ],
      [{ category: 'Video Photographer', professionalId: 'pro1' }] // general fill
    );
    expect(getVacantSlots(req)).toEqual([
      { category: 'Video Photographer', quantity: 1, requiredCapability: 'drone' },
    ]);
  });

  it('mixing: a drone fill only consumes the drone slot, leaving the general slot vacant', () => {
    const req = makeRequest(
      [
        { category: 'Video Photographer', quantity: 1, requiredCapability: 'drone' },
        { category: 'Video Photographer', quantity: 1 },
      ],
      [{ category: 'Video Photographer', professionalId: 'pro1', requiredCapability: 'drone' }]
    );
    expect(getVacantSlots(req)).toEqual([{ category: 'Video Photographer', quantity: 1 }]);
  });
});

describe('professionalMatchesProject (capability-aware)', () => {
  const proj = (crewSlots: unknown[], filledSlots: unknown[] = []): ProjectRequest =>
    ({ ...makeRequest([], []), crewSlots, filledSlots } as unknown as ProjectRequest);

  it('general slot matches a pro who has that role (general)', () => {
    const p = proj([{ category: 'Editor', quantity: 1 }]);
    expect(professionalMatchesProject([{ role: 'editor', specializations: ['general'] }], p)).toBe(true);
  });

  it('does not match a pro with a different role', () => {
    const p = proj([{ category: 'Editor', quantity: 1 }]);
    expect(professionalMatchesProject([{ role: 'videographer', specializations: ['general'] }], p)).toBe(false);
  });

  it('specialized slot matches only a pro who has that capability', () => {
    const p = proj([{ category: 'Editor', quantity: 1, requiredCapability: 'colorist' }]);
    expect(professionalMatchesProject([{ role: 'editor', specializations: ['general'] }], p)).toBe(false);
    expect(professionalMatchesProject([{ role: 'editor', specializations: ['general', 'colorist'] }], p)).toBe(true);
  });

  it('mixed project: a general-only pro matches the general slot but not the drone slot', () => {
    const p = proj([
      { category: 'Video Photographer', quantity: 1, requiredCapability: 'drone' },
      { category: 'Video Photographer', quantity: 1 },
    ]);
    expect(professionalMatchesProject([{ role: 'videographer', specializations: ['general'] }], p)).toBe(true);
    // drone-only pro (no general) matches the drone slot but not the general one — still a match overall
    expect(professionalMatchesProject([{ role: 'videographer', specializations: ['drone'] }], p)).toBe(true);
  });

  it('ignores fully-booked slots', () => {
    const p = proj([{ category: 'Editor', quantity: 1 }], [{ category: 'Editor' }]);
    expect(professionalMatchesProject([{ role: 'editor', specializations: ['general'] }], p)).toBe(false);
  });
});

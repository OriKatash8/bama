jest.mock('@core/firebase/firestore', () => ({
  subscribeToCollection: jest.fn(),
  where: jest.fn(),
}));

import { getVacantSlots } from '../useNoticeboard';
import { professionalMatchesProject } from '@features/noticeboard/matching';
import type { ProjectRequest } from '@core/types/project';

function makeRequest(
  crewSlots: { category: string; subcategory: string; quantity: number }[],
  filledSlots: { category: string; subcategory: string; professionalId: string }[]
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
    const req = makeRequest(
      [{ category: 'Video', subcategory: 'DP', quantity: 2 }],
      []
    );
    expect(getVacantSlots(req)).toEqual([
      { category: 'Video', subcategory: 'DP', quantity: 2 },
    ]);
  });

  it('reduces quantity by the number of filled entries for that slot', () => {
    const req = makeRequest(
      [{ category: 'Video', subcategory: 'DP', quantity: 3 }],
      [
        { category: 'Video', subcategory: 'DP', professionalId: 'pro1' },
        { category: 'Video', subcategory: 'DP', professionalId: 'pro2' },
      ]
    );
    expect(getVacantSlots(req)).toEqual([
      { category: 'Video', subcategory: 'DP', quantity: 1 },
    ]);
  });

  it('excludes a slot when it is fully filled', () => {
    const req = makeRequest(
      [{ category: 'Video', subcategory: 'DP', quantity: 1 }],
      [{ category: 'Video', subcategory: 'DP', professionalId: 'pro1' }]
    );
    expect(getVacantSlots(req)).toEqual([]);
  });

  it('only counts filledSlots that match both category and subcategory', () => {
    const req = makeRequest(
      [
        { category: 'Video', subcategory: 'DP', quantity: 1 },
        { category: 'Audio', subcategory: 'Mixer', quantity: 1 },
      ],
      [{ category: 'Video', subcategory: 'DP', professionalId: 'pro1' }]
    );
    expect(getVacantSlots(req)).toEqual([
      { category: 'Audio', subcategory: 'Mixer', quantity: 1 },
    ]);
  });

  it('returns empty array when every slot is fully filled', () => {
    const req = makeRequest(
      [
        { category: 'Video', subcategory: 'DP', quantity: 1 },
        { category: 'Audio', subcategory: 'Mixer', quantity: 1 },
      ],
      [
        { category: 'Video', subcategory: 'DP', professionalId: 'pro1' },
        { category: 'Audio', subcategory: 'Mixer', professionalId: 'pro2' },
      ]
    );
    expect(getVacantSlots(req)).toEqual([]);
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

  it('ignores fully-booked slots', () => {
    const p = proj([{ category: 'Editor', quantity: 1 }], [{ category: 'Editor' }]);
    expect(professionalMatchesProject([{ role: 'editor', specializations: ['general'] }], p)).toBe(false);
  });
});

jest.mock('@core/firebase/firestore', () => ({
  subscribeToCollection: jest.fn(),
  where: jest.fn(),
}));

import { getVacantSlots } from '../useNoticeboard';
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
    date: '2026-07-01',
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

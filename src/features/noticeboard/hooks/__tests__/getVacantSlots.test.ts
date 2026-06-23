jest.mock('@core/firebase/firestore', () => ({
  subscribeToCollection: jest.fn(),
  where: jest.fn(),
}));

import { getVacantSlots, filterByProfessionalCategories } from '../useNoticeboard';
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

describe('filterByProfessionalCategories', () => {
  function makeProject(categories: string[]): ProjectRequest {
    return makeRequest(
      categories.map(cat => ({ category: cat, subcategory: 'Any', quantity: 1 })),
      []
    );
  }

  it('returns empty array when categories is empty', () => {
    const projects = [makeProject(['Video Editor'])];
    expect(filterByProfessionalCategories(projects, [])).toEqual([]);
  });

  it('shows project when professional matches the only required category', () => {
    const projects = [makeProject(['Video Editor'])];
    expect(filterByProfessionalCategories(projects, ['Video Editor'])).toEqual(projects);
  });

  it('hides project when professional does not match any required category', () => {
    const projects = [makeProject(['Photographer'])];
    expect(filterByProfessionalCategories(projects, ['Video Editor'])).toEqual([]);
  });

  it('shows project when professional matches any one of multiple required categories', () => {
    const projects = [makeProject(['Photographer', 'Video Editor'])];
    expect(filterByProfessionalCategories(projects, ['Video Editor'])).toEqual(projects);
  });

  it('hides project when professional matches none of multiple required categories', () => {
    const projects = [makeProject(['Photographer', 'Director'])];
    expect(filterByProfessionalCategories(projects, ['Video Editor'])).toEqual([]);
  });

  it('hides project whose only matching category slot is already fully booked', () => {
    const proj = makeRequest(
      [{ category: 'Video Editor', subcategory: 'Music', quantity: 1 }],
      [{ category: 'Video Editor', subcategory: 'Music', professionalId: 'pro1' }]
    );
    expect(filterByProfessionalCategories([proj], ['Video Editor'])).toEqual([]);
  });
});

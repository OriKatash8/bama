import { ROLE_CATEGORIES, getCommunityCategories, normalizeCommunityCategories } from '../categories';

describe('getCommunityCategories', () => {
  it('prefers the list', () => {
    expect(getCommunityCategories({ categories: ['Editor', 'Video Photographer'], category: 'Editor' }))
      .toEqual(['Editor', 'Video Photographer']);
  });

  it('reads a doc with only the legacy category as one', () => {
    expect(getCommunityCategories({ category: 'Editor' })).toEqual(['Editor']);
  });

  it('falls back to the legacy category when the list is empty or null', () => {
    expect(getCommunityCategories({ categories: [], category: 'Editor' })).toEqual(['Editor']);
    expect(getCommunityCategories({ categories: null, category: 'Editor' })).toEqual(['Editor']);
  });

  it('is empty when there is nothing', () => {
    expect(getCommunityCategories({})).toEqual([]);
    expect(getCommunityCategories({ category: '' })).toEqual([]);
  });
});

describe('normalizeCommunityCategories', () => {
  it('orders by ROLE_CATEGORIES, so categories[0] is stable', () => {
    expect(normalizeCommunityCategories(['Editor', 'Video Photographer']))
      .toEqual(['Video Photographer', 'Editor']);
  });

  it('drops duplicates and unknown strings', () => {
    expect(normalizeCommunityCategories(['Editor', 'Editor', 'Wizard'])).toEqual(['Editor']);
  });

  it('keeps all of them — there is no maximum', () => {
    expect(normalizeCommunityCategories([...ROLE_CATEGORIES])).toEqual(ROLE_CATEGORIES);
  });
});

/**
 * Every `category` value that actually exists on priceOffers/bundleOffers in
 * production, asserted to resolve to Hebrew. The offer cards render this string,
 * so an unmapped value shows English to a Hebrew user.
 */
import { categoryLabel } from '../categories';

// Audited from production: the 9 distinct priceOffers.category values.
const PRODUCTION_CATEGORIES = [
  'Video Photographer',
  'Editor',
  'Still Photographer',
  'Sound Recordist',
  'Graphic Designer',
  'Lighting Tech',
  'Social Media',
  'Studio & Audio',
  'AI Specialist',
];

const hasHebrew = (s: string) => /[֐-׿]/.test(s);

describe('categoryLabel over the real production category values', () => {
  it.each(PRODUCTION_CATEGORIES.filter((c) => c !== 'AI Specialist'))(
    'resolves %s to Hebrew',
    (category) => {
      expect(hasHebrew(categoryLabel(category, 'he'))).toBe(true);
    },
  );

  it.each(PRODUCTION_CATEGORIES)('resolves %s to a non-empty English label', (category) => {
    expect(categoryLabel(category, 'en').length).toBeGreaterThan(0);
  });

  /**
   * 'AI Specialist' is NOT in ROLE_TO_LEGACY_CATEGORY, so categoryLabel falls
   * back to the input and shows English in Hebrew mode. One offer in production.
   * Pinned rather than fixed: adding it to the role map is a taxonomy decision,
   * and this test is what will fail if someone assumes it is covered.
   */
  it('does NOT cover AI Specialist — known gap, 1 offer in production', () => {
    expect(categoryLabel('AI Specialist', 'he')).toBe('AI Specialist');
    expect(hasHebrew(categoryLabel('AI Specialist', 'he'))).toBe(false);
  });

  it('falls back to the input for anything unmapped rather than throwing', () => {
    expect(categoryLabel('Totally Unknown Role', 'he')).toBe('Totally Unknown Role');
  });
});

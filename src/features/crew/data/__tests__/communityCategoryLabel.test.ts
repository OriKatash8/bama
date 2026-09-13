/**
 * A community is a group of people, so its category reads as a plural —
 * "Editors" / "עורכים" — while everywhere else (projects, offers, courses) the
 * same category is a single role and keeps `categoryLabel`'s singular.
 */
import { ROLES, ROLE_TO_LEGACY_CATEGORY, categoryLabel, communityCategoryLabel } from '../categories';

const PLURALS: [legacy: string, en: string, he: string][] = [
  ['Video Photographer', 'Videographers',        'צלמי וידאו'],
  ['Still Photographer', 'Stills Photographers', 'צלמי תמונות'],
  ['Editor',             'Editors',              'עורכים'],
  ['Graphic Designer',   'Graphic Designers',    'גרפיקאים'],
  ['Social Media',       'Social Media',         'אנשי סושיאל'],
  ['Studio & Audio',     'Studio & Audio',       'אולפני הקלטות'],
  ['Sound Recordist',    'Sound Recordists',     'סאונדמנים'],
  ['Lighting Tech',      'Lighting Techs',       'תאורנים'],
];

it.each(PLURALS)('labels the %s community category as "%s" / "%s"', (legacy, en, he) => {
  expect(communityCategoryLabel(legacy, 'en')).toBe(en);
  expect(communityCategoryLabel(legacy, 'he')).toBe(he);
});

it.each(ROLES.map((r) => ROLE_TO_LEGACY_CATEGORY[r.id]))(
  'has a plural for %s, so a new role cannot silently show its singular',
  (legacy) => {
    expect(communityCategoryLabel(legacy, 'he')).not.toBe(categoryLabel(legacy, 'he'));
  },
);

it('accepts a role id as well as the stored legacy string, like categoryLabel', () => {
  expect(communityCategoryLabel('editor', 'he')).toBe('עורכים');
});

it('falls back to the input for a category it does not know', () => {
  expect(communityCategoryLabel('AI Specialist', 'he')).toBe('AI Specialist');
});

it('leaves the singular categoryLabel used by projects and offers untouched', () => {
  expect(categoryLabel('Editor', 'en')).toBe('Editor');
  expect(categoryLabel('Editor', 'he')).toBe('עורך');
});

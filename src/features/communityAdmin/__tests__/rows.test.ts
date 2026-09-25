import { buildMemberRows, buildRequestRows, filterMembers } from '../rows';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { AdminT } from '../i18n';
import type { Person } from '../hooks';

// rows.ts reaches i18n.ts, which imports the settings store; nothing here reads it.
jest.mock('@core/stores/settingsStore', () => ({ useSettingsStore: jest.fn() }));

const tFor = (tr: typeof en): AdminT => (key, vars) => {
  let s = (tr.community_admin as Record<string, string>)[key] ?? key;
  for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{{${k}}}`, String(v));
  return s;
};
const tEn = tFor(en);
const tHe = tFor(he);

const NOW = new Date(2026, 8, 25, 15);
const person = (name: string, roleId: string | null = null): Person => ({ name, photoURL: null, roleId });

describe('buildRequestRows', () => {
  it('shows "role · time ago" for a professional', () => {
    const [row] = buildRequestRows(
      [{ userId: 'u1', displayName: 'Old Name', requestedAt: new Date(2026, 8, 23, 9) }],
      { u1: person('Noa Bareket', 'editor') },
      tEn,
      'en',
      NOW,
    );
    expect(row).toEqual({ userId: 'u1', name: 'Noa Bareket', meta: 'Editor · 2 days ago' });
  });

  it('falls back to the name on the request, and drops the role for a client', () => {
    const [row] = buildRequestRows(
      [{ userId: 'u2', displayName: 'דנה', requestedAt: new Date(2026, 8, 25, 8) }],
      {},
      tHe,
      'he',
      NOW,
    );
    expect(row.name).toBe('דנה');
    expect(row.meta).toBe('היום');
  });
});

describe('buildMemberRows', () => {
  const people = {
    own: person('Olive Owner'),
    a: person('Adam', 'videographer'),
    b: person('Bea'),
    c: person('Cai'),
  };
  const rows = () =>
    buildMemberRows(
      ['a', 'b', 'own', 'c'],
      'own',
      people,
      { a: 40, b: 10, c: 10, own: 5 },
      new Map([['a', new Date(2026, 8, 24)]]),
      tEn,
      'en',
      NOW,
    );

  it('puts the owner first, then the most active', () => {
    expect(rows().map((r) => r.userId)).toEqual(['own', 'a', 'b', 'c']);
  });

  it('sizes activity against the most active and colours strictly above the median', () => {
    const byId = Object.fromEntries(rows().map((r) => [r.userId, r]));
    expect(byId.a.activity).toBe(1);
    expect(byId.b.activity).toBe(0.25);
    // counts 5,10,10,40 → median 10: only 40 is above it
    expect(rows().filter((r) => r.aboveMedian).map((r) => r.userId)).toEqual(['a']);
  });

  it('writes "role · Joined X ago" when both are known, and nothing it does not know', () => {
    const byId = Object.fromEntries(rows().map((r) => [r.userId, r]));
    expect(byId.a.meta).toBe('Videographer · Joined yesterday');
    expect(byId.b.meta).toBe('');
  });

  it('marks only the owner', () => {
    expect(rows().filter((r) => r.isOwner).map((r) => r.userId)).toEqual(['own']);
  });
});

describe('filterMembers', () => {
  const rows = buildMemberRows(
    ['a', 'b'],
    'x',
    { a: person('Adam Peretz', 'videographer'), b: person('Bea Cohen') },
    {},
    new Map([['b', new Date(2026, 8, 25)]]),
    tEn,
    'en',
    NOW,
  );

  it('matches name or role, in either language, ignoring case', () => {
    expect(filterMembers(rows, 'peretz').map((r) => r.userId)).toEqual(['a']);
    expect(filterMembers(rows, 'VIDEOgrapher').map((r) => r.userId)).toEqual(['a']);
    expect(filterMembers(rows, 'צלם').map((r) => r.userId)).toEqual(['a']);
  });

  it('does not match on the "joined" text', () => {
    expect(filterMembers(rows, 'today')).toEqual([]);
  });

  it('returns everyone for an empty query', () => {
    expect(filterMembers(rows, '  ')).toHaveLength(2);
  });
});

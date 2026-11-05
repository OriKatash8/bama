import { mockDb } from '../__fixtures__/memoryHelpers';
import { growFullName, israeliMobileLocal, GROW_NAME_MAX } from '../linkLogic';
import { loadPayer } from '../link';
import { buildMakeRequest } from '../growLinkProvider';

jest.mock('../../lifecycle/helpers', () => require('../__fixtures__/memoryHelpers').mockHelpers);
jest.mock('../notices', () => ({ sendLinkNotice: jest.fn(async () => undefined) }));
let mockEmail: string | undefined;
jest.mock('firebase-admin', () => ({
  auth: () => ({ getUser: async () => ({ email: mockEmail }) }),
}));

/** Grow: fullName is at least two words, each at least two characters. */
const growAccepts = (n: string) => {
  const w = n.split(' ');
  return n === n.trim() && !/\s{2}/.test(n) && w.length >= 2 && w.every((x) => Array.from(x).length >= 2)
    && n.length <= GROW_NAME_MAX;
};

describe('growFullName', () => {
  it.each([
    ['Dana Levi', 'Dana Levi'],
    ['  Dana   Levi ', 'Dana Levi'],
    ['דנה לוי', 'דנה לוי'],
    ['Anna Maria Rossi', 'Anna Maria Rossi'],
    ['test1', 'test1 BAMA'],                    // the demo-test1 case that Grow rejected
    ['  test1  ', 'test1 BAMA'],
    ['דנה', 'דנה BAMA'],
    ['Al', 'Al BAMA'],                          // two characters is enough
    ['A', 'משתמש BAMA'],
    ['A B', 'משתמש BAMA'],                      // one-letter words are dropped, nothing left
    ['Dana L', 'Dana BAMA'],                    // the one-letter word is dropped
    ['J. Smith', 'J. Smith'],                   // "J." is two characters, so both words qualify
    ['', 'משתמש BAMA'],
    ['   ', 'משתמש BAMA'],
    [undefined, 'משתמש BAMA'],
    [null, 'משתמש BAMA'],
    [42, 'משתמש BAMA'],
  ])('%j -> %j', (raw, want) => {
    const got = growFullName(raw);
    expect(got).toBe(want);
    expect(growAccepts(got)).toBe(true);
  });

  it('every output is something Grow accepts, whatever goes in', () => {
    const inputs = ['', 'x', 'xy', 'x y', 'xy z', 'xy zz', 'a'.repeat(200), `${'ab '.repeat(40)}`,
      'ab ' + 'c'.repeat(100), '😀😀', '😀😀 😀😀', 'a b c d e f', 'דנה', '  \t\n ', "O'Neil Mc Donald"];
    for (const i of inputs) expect(growAccepts(growFullName(i))).toBe(true);
  });

  it('a very long name is cut on a word boundary and stays valid', () => {
    const got = growFullName('Alexander Bartholomew Christopher Maximilian Fitzgerald Montgomery');
    expect(got.length).toBeLessThanOrEqual(GROW_NAME_MAX);
    expect(got.split(' ').length).toBeGreaterThanOrEqual(2);
    expect('Alexander Bartholomew Christopher Maximilian Fitzgerald Montgomery').toContain(got);
  });

  it('one huge word is shortened with the suffix', () => {
    const got = growFullName('a'.repeat(200));
    expect(got).toBe(`${'a'.repeat(GROW_NAME_MAX - 5)} BAMA`);
    expect(got.length).toBe(GROW_NAME_MAX);
  });
});

describe('israeliMobileLocal', () => {
  it.each([
    ['+972501234567', '0501234567'],
    ['972501234567', '0501234567'],
    ['0501234567', '0501234567'],
    [' +972541234567 ', '0541234567'],
    ['+972581234567', '0581234567'],
  ])('accepts %j as %j', (raw, want) => expect(israeliMobileLocal(raw)).toBe(want));

  it.each([
    '+97231234567',     // landline
    '031234567',
    '+972771234567',    // VoIP
    '0771234567',
    '+14155550123',     // foreign
    '+9725012345',      // too short
    '+97250123456789',  // too long
    '05012345',         // too short, local
    '050123456789',     // too long, local
    '+972 50 123 4567', // not normalised (the app stores E.164)
    '', null, undefined, 5,
  ])('rejects %j', (raw) => expect(israeliMobileLocal(raw)).toBeNull());
});

describe('loadPayer', () => {
  beforeEach(() => {
    mockDb.reset();
    mockEmail = undefined;
    mockDb.seed('projects/p1', { title: 'Shoot' });
  });

  it('demo-test1: a one-word name becomes a two-word name, the phone goes out in local form', async () => {
    mockDb.seed('users/u1', { displayName: 'test1' });
    mockDb.seed('users/u1/private/contact', { phone: '+972541234567' });
    const r = await loadPayer('u1', 'p1');
    expect(r).toEqual({ ok: true, title: 'Shoot', payer: { fullName: 'test1 BAMA', phone: '0541234567' } });
    if (!r.ok) throw new Error('unreachable');
    // ...and that is what Make receives.
    const body = buildMakeRequest({
      feeKey: 'p1_u1', requestId: 'r', projectId: 'p1', proId: 'u1', amount: 6, currency: 'ILS',
      description: 'd', payer: r.payer,
    });
    expect(body.payer).toEqual({ fullName: 'test1 BAMA', phone: '0541234567' });
  });

  it('keeps a good name and includes the Auth email when there is one', async () => {
    mockEmail = 'dana@example.com';
    mockDb.seed('users/u1', { displayName: 'Dana Levi' });
    mockDb.seed('users/u1/private/contact', { phone: '+972501234567' });
    expect(await loadPayer('u1', 'p1')).toMatchObject({
      ok: true, payer: { fullName: 'Dana Levi', phone: '0501234567', email: 'dana@example.com' },
    });
  });

  it.each([
    ['a landline', '+97231234567'], ['a foreign number', '+14155550123'], ['no phone field', undefined],
  ])('%s -> no-mobile (the fee goes to needs_phone)', async (_n, phone) => {
    mockDb.seed('users/u1', { displayName: 'Dana Levi' });
    mockDb.seed('users/u1/private/contact', phone ? { phone } : {});
    expect(await loadPayer('u1', 'p1')).toEqual({ ok: false, reason: 'no-mobile' });
  });

  it('no contact doc at all -> no-mobile', async () => {
    mockDb.seed('users/u1', { displayName: 'Dana Levi' });
    expect(await loadPayer('u1', 'p1')).toEqual({ ok: false, reason: 'no-mobile' });
  });

  it('a missing name falls back to a valid one', async () => {
    mockDb.seed('users/u1/private/contact', { phone: '+972501234567' });
    expect(await loadPayer('u1', 'p1')).toMatchObject({ ok: true, payer: { fullName: 'משתמש BAMA' } });
  });
});

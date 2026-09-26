import { buildClosingNotice, isClosingTransition, BAMA_CONTACT_EMAIL } from '../closingNotice';

/**
 * When a project ends — completed OR cancelled — the chat gets one closing
 * message: every member with their role(s) and phone number, the client first,
 * then BAMA's contact email. Everyone in the chat sees the whole list (decided
 * with the product owner: the project is over, so the team may reach each other).
 */

const people = { client: { name: 'Dana' }, p1: { name: 'Avi' }, p2: { name: 'Noa' } };

const base = {
  status: 'completed' as const,
  clientId: 'client',
  filledSlots: [
    { professionalId: 'p1', category: 'Video Photographer' },
    { professionalId: 'p2', category: 'Editor' },
    { professionalId: 'p1', category: 'Editor' },
  ],
  people,
  phones: { client: '+972501234567', p1: '+972541112222', p2: null },
};

it('lists the client first, then each professional once with all their roles', () => {
  const n = buildClosingNotice(base);
  expect(n.team.map((m) => [m.uid, m.isClient, m.roles])).toEqual([
    ['client', true, []],
    ['p1', false, ['Video Photographer', 'Editor']],
    ['p2', false, ['Editor']],
  ]);
  expect(n.team.map((m) => m.name)).toEqual(['Dana', 'Avi', 'Noa']);
});

it('carries each phone number, null for someone who has none', () => {
  const n = buildClosingNotice(base);
  expect(n.team.map((m) => m.phone)).toEqual(['+972501234567', '+972541112222', null]);
});

it('ends with BAMA\'s contact email', () => {
  expect(BAMA_CONTACT_EMAIL).toBe('bama.app.hk@gmail.com');
  const n = buildClosingNotice(base);
  expect(n.contactEmail).toBe(BAMA_CONTACT_EMAIL);
  expect(n.text.trim().endsWith(BAMA_CONTACT_EMAIL)).toBe(true);
});

it('says whether the project completed or was cancelled', () => {
  expect(buildClosingNotice(base).closedAs).toBe('completed');
  const cancelled = buildClosingNotice({ ...base, status: 'cancelled' });
  expect(cancelled.closedAs).toBe('cancelled');
  expect(cancelled.text).not.toBe(buildClosingNotice(base).text);
});

it('has a plain-text version for the chat preview and older app builds, with every member', () => {
  const { text } = buildClosingNotice(base);
  for (const who of ['Dana', 'Avi', 'Noa', '050-123-4567', '054-111-2222']) expect(text).toContain(who);
});

it('a member with no name still appears, and a missing name never crashes', () => {
  const n = buildClosingNotice({ ...base, people: { client: { name: 'Dana' } } });
  expect(n.team).toHaveLength(3);
  expect(n.team[1].name).toBe('');
});

describe('isClosingTransition', () => {
  it.each([
    ['open', 'completed', true],
    ['in_progress', 'completed', true],
    ['in_progress', 'cancelled', true],
    ['open', 'cancelled', true],
    ['completed', 'completed', false],
    ['cancelled', 'cancelled', false],
    ['completed', 'cancelled', false],
    ['completed', 'open', false],
    ['open', 'in_progress', false],
  ])('%s → %s: %s', (before, after, expected) => {
    expect(isClosingTransition(before, after)).toBe(expected);
  });
});

import { buildClosingNotice, isClosingTransition, BAMA_CONTACT_EMAIL, closingText, scrubClosingMember } from '../closingNotice';

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

describe('the email shown instead of a phone number', () => {
  const emails = { client: 'dana@example.com', p1: 'avi@example.com', p2: 'noa@example.com' };

  it('on a completed project, only for a member with no phone', () => {
    const n = buildClosingNotice({ ...base, emails });
    expect(n.team.map((m) => [m.uid, m.phone, m.email])).toEqual([
      ['client', '+972501234567', null],
      ['p1', '+972541112222', null],
      ['p2', null, 'noa@example.com'],
    ]);
  });

  it('the plain-text version prints that email instead of a dash', () => {
    const { text } = buildClosingNotice({ ...base, emails });
    expect(text).toContain('Noa — Editor — noa@example.com');
    expect(text).not.toContain('dana@example.com');
  });

  it('on a cancelled project, never — the member keeps the dash', () => {
    const n = buildClosingNotice({ ...base, status: 'cancelled', emails });
    expect(n.team.map((m) => m.email)).toEqual([null, null, null]);
    expect(n.text).toContain('Noa — Editor — —');
    expect(n.text).not.toContain('noa@example.com');
  });

  it('with no email to share, a member with no phone keeps the dash', () => {
    const n = buildClosingNotice({ ...base, emails: { p2: null } });
    expect(n.team[2].email).toBeNull();
    expect(n.text).toContain('Noa — Editor — —');
    expect(buildClosingNotice(base).team[2].email).toBeNull();
  });
});

describe('for account deletion', () => {
  const emails = { p2: 'noa@example.com' };

  it('closingText is exactly the text the builder writes', () => {
    for (const status of ['completed', 'cancelled'] as const) {
      const n = buildClosingNotice({ ...base, status, emails });
      expect(closingText(status, n.team, n.contactEmail)).toBe(n.text);
    }
  });

  it('scrubClosingMember: the user becomes the tombstone, keeps their roles; nobody else changes', () => {
    const { team } = buildClosingNotice({ ...base, emails });
    const scrubbed = scrubClosingMember(team, 'p2', 'חשבון שנמחק')!;
    expect(scrubbed[2]).toEqual({ ...team[2], name: 'חשבון שנמחק', phone: null, email: null });
    expect(scrubbed.slice(0, 2)).toEqual(team.slice(0, 2));
    expect(closingText('completed', scrubbed, BAMA_CONTACT_EMAIL)).toContain('• חשבון שנמחק — Editor — —');
  });

  it('scrubClosingMember: null when the user is not on the list', () => {
    expect(scrubClosingMember(buildClosingNotice(base).team, 'nobody', 'x')).toBeNull();
  });
});

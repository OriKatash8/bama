/**
 * The closing message a project's chat gets when the project ends — completed OR
 * cancelled: every member with their role(s) and phone number, the client first,
 * then BAMA's contact email. Pure, so it is tested without Firestore; the
 * trigger (closingTrigger.ts) gathers the inputs and writes the result.
 *
 * Everyone in the chat sees the whole list. That is deliberate and narrower than
 * it looks: getContactPhone (contactPolicy) still keeps a professional's number
 * from other professionals while a project runs; only this one closing message,
 * written once the project is over, shares the team's numbers with the team.
 */

export const BAMA_CONTACT_EMAIL = 'bama.app.hk@gmail.com';

const CLOSED = new Set(['completed', 'cancelled']);

/** True exactly when a project moves INTO an ended state. */
export function isClosingTransition(before: string | undefined, after: string | undefined): boolean {
  return CLOSED.has(after ?? '') && !CLOSED.has(before ?? '');
}

export type ClosingMember = {
  uid: string;
  name: string;
  isClient: boolean;
  /** Legacy category strings, as on crewSlots/filledSlots; the app shows them localized. */
  roles: string[];
  /** E.164, or null when the member never added one. */
  phone: string | null;
};

export type ClosingNotice = {
  kind: 'project_closed';
  closedAs: 'completed' | 'cancelled';
  team: ClosingMember[];
  contactEmail: string;
  /** Plain Hebrew version: the chat-list preview, and what an older app build shows. */
  text: string;
};

/** MIRROR of formatPhoneForDisplay (src/features/auth/utils/phone.ts): Israel the local way. */
function displayPhone(e164: string | null): string {
  if (!e164) return '—';
  if (!e164.startsWith('+972')) return e164;
  const n = `0${e164.slice(4)}`;
  return n.length === 10 ? `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}` : `${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5)}`;
}

export function buildClosingNotice(input: {
  status: 'completed' | 'cancelled';
  clientId: string;
  filledSlots: { professionalId: string; category: string }[];
  people: Record<string, { name?: string } | undefined>;
  phones: Record<string, string | null | undefined>;
  email?: string;
}): ClosingNotice {
  const { status, clientId, filledSlots, people, phones } = input;
  const email = input.email ?? BAMA_CONTACT_EMAIL;
  const member = (uid: string, isClient: boolean, roles: string[]): ClosingMember => ({
    uid,
    name: people[uid]?.name ?? '',
    isClient,
    roles,
    phone: phones[uid] ?? null,
  });

  // One entry per professional, their roles in slot order.
  const pros = new Map<string, string[]>();
  for (const s of filledSlots) {
    if (!s.professionalId || s.professionalId === clientId) continue;
    const roles = pros.get(s.professionalId) ?? [];
    if (!roles.includes(s.category)) roles.push(s.category);
    pros.set(s.professionalId, roles);
  }
  const team = [member(clientId, true, []), ...[...pros].map(([uid, roles]) => member(uid, false, roles))];

  const headline = status === 'completed' ? '🏁 הפרויקט הסתיים — פרטי הקשר של הצוות' : '🏁 הפרויקט בוטל — פרטי הקשר של הצוות';
  const lines = team.map((m) =>
    `• ${m.name || '—'} — ${m.isClient ? 'לקוח' : m.roles.join(', ')} — ${displayPhone(m.phone)}`);
  const text = [headline, ...lines, `לפניות: ${email}`].join('\n');

  return { kind: 'project_closed', closedAs: status, team, contactEmail: email, text };
}

import { ROLE_BY_ID, labelOf } from '@features/crew/data/categories';
import { median } from './aggregate';
import { ago, type AdminT } from './i18n';
import type { PendingRequest, Person } from './hooks';
import type { RequestRowData } from './components/RequestsCard';
import type { MemberRowData } from './components/MembersCard';

type Lang = 'he' | 'en';

function roleLabels(person: Person | undefined): { current: (lang: Lang) => string | null; both: string } {
  const def = person?.roleId ? ROLE_BY_ID[person.roleId] : undefined;
  return {
    current: (lang) => (def ? labelOf(def, lang) : null),
    both: def ? `${def.he} ${def.en}` : '',
  };
}

const joinMeta = (parts: (string | null)[]) => parts.filter(Boolean).join(' · ');

/** "role · time ago" — role only for professionals, time only when known. */
export function buildRequestRows(
  requests: PendingRequest[],
  people: Record<string, Person>,
  t: AdminT,
  lang: Lang,
  now: Date,
): RequestRowData[] {
  return requests.map((r) => {
    const person = people[r.userId];
    return {
      userId: r.userId,
      // The request carries the name the requester had when asking; prefer the live one.
      name: person?.name || r.displayName,
      meta: joinMeta([roleLabels(person).current(lang), r.requestedAt ? ago(t, r.requestedAt, now) : null]),
    };
  });
}

/**
 * Owner first, then most active first. The activity bar is relative to the
 * most active member; it is accent only strictly ABOVE the median, so in a
 * quiet community where most counts tie, most bars stay muted.
 */
export function buildMemberRows(
  members: string[],
  ownerId: string,
  people: Record<string, Person>,
  counts: Record<string, number>,
  joinedAt: Map<string, Date>,
  t: AdminT,
  lang: Lang,
  now: Date,
): MemberRowData[] {
  const msgs = members.map((uid) => counts[uid] ?? 0);
  const max = Math.max(1, ...msgs);
  const mid = median(msgs);
  const rows = members.map((uid, i) => {
    const person = people[uid];
    const roles = roleLabels(person);
    const joined = joinedAt.get(uid);
    return {
      userId: uid,
      name: person?.name ?? '',
      meta: joinMeta([roles.current(lang), joined ? t('joined', { ago: ago(t, joined, now) }) : null]),
      searchText: roles.both,
      isOwner: uid === ownerId,
      messages: msgs[i],
      activity: msgs[i] / max,
      aboveMedian: msgs[i] > mid,
    };
  });
  return rows.sort(
    (a, b) => Number(b.isOwner) - Number(a.isOwner) || b.messages - a.messages || a.name.localeCompare(b.name),
  );
}

/** Case-insensitive match on name and role (in either language). */
export function filterMembers(rows: MemberRowData[], query: string): MemberRowData[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return rows;
  return rows.filter((r) => `${r.name} ${r.searchText}`.toLocaleLowerCase().includes(q));
}

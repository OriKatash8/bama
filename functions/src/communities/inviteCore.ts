/**
 * Community invites: the pure decisions, kept free of Firebase so they can be
 * unit-tested directly (functions/src/__tests__/communityInvites.test.ts).
 * invites.ts wires these to Firestore and the function triggers.
 */
import { randomBytes, randomInt } from 'crypto';

// ── Tokens and codes ─────────────────────────────────────────────────────────

/** Misread-safe: no 0/O, no 1/I/L. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;

/** 16 random bytes as base64url is exactly 22 characters, with no padding. */
export function generateToken(): string {
  return randomBytes(16).toString('base64url');
}

export function generateShortCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export const isTokenShape = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{22}$/.test(v);

export const isCodeShape = (v: unknown): v is string =>
  typeof v === 'string' && new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(v);

// ── Permissions ──────────────────────────────────────────────────────────────

export type CommunityDoc = {
  type?: unknown;
  ownerId?: unknown;
  members?: unknown;
  name?: unknown;
  description?: unknown;
  photoURL?: unknown;
  allowMemberInvites?: unknown;
};

const isMember = (c: CommunityDoc, uid: string) => Array.isArray(c.members) && c.members.includes(uid);

/**
 * Who may create (share) an invite. The share button in the app uses a mirror of
 * THIS predicate (src/features/communities/invites/permissions.ts, parity-tested)
 * so the button is never shown to someone the server would refuse.
 *
 * Members are allowed only when `allowMemberInvites === true`, strictly true.
 * The field exists on no community and nothing sets it, so today this is owner and
 * app admin only. Anything looser (`!== false`) would silently open invites to
 * every member with no owner control.
 */
export function canCreateInvite(p: { uid: string; isAppAdmin: boolean; community: CommunityDoc | null }): boolean {
  const c = p.community;
  if (!c || c.type !== 'community') return false;
  if (p.isAppAdmin || c.ownerId === p.uid) return true;
  return c.allowMemberInvites === true && isMember(c, p.uid);
}

/** Owner and app admin revoke any invite for the community; anyone else only their own. */
export function canRevokeInvite(p: {
  uid: string;
  isAppAdmin: boolean;
  community: CommunityDoc | null;
  invite: { communityId?: unknown; createdBy?: unknown };
}): boolean {
  if (p.isAppAdmin) return true;
  if (p.community && p.community.ownerId === p.uid) return true;
  return p.invite.createdBy === p.uid;
}

// ── Response bodies ──────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Every miss from the PUBLIC resolver: unknown token or code, revoked invite,
 * deleted community, malformed input. One constant, so no branch can
 * accidentally differ from another and leak which case it was.
 */
export const PUBLIC_MISS = Object.freeze({ exists: false as const });

/**
 * A public hit. EXACTLY these keys. This output will be rendered as a WhatsApp
 * preview seen by everyone in a chat: never member names, counts, ids or the token.
 */
export function publicResolveBody(c: CommunityDoc) {
  return {
    exists: true as const,
    revoked: false as const,
    communityName: str(c.name) ?? '',
    description: str(c.description),
    avatarUrl: str(c.photoURL),
  };
}

export type Membership = 'member' | 'pending' | 'none';

/** Signed-in lookup. A revoked invite reports only that it was revoked. */
export function authedInviteBody(p: {
  revoked: boolean;
  token: string;
  communityId: string;
  community: CommunityDoc;
  membership: Membership;
}) {
  if (p.revoked) return { exists: true as const, revoked: true as const };
  return {
    exists: true as const,
    revoked: false as const,
    token: p.token,
    communityId: p.communityId,
    communityName: str(p.community.name) ?? '',
    description: str(p.community.description),
    avatarUrl: str(p.community.photoURL),
    membership: p.membership,
  };
}

// ── Rate-limit key ───────────────────────────────────────────────────────────

function ipv4(v: string): string | null {
  const parts = v.split('.');
  if (parts.length !== 4) return null;
  if (!parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
  return parts.map(Number).join('.');
}

/** Expanded 8 groups of 4 hex digits, or null. */
function ipv6Groups(v: string): string[] | null {
  const addr = v.split('%')[0].toLowerCase();
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, '0'));
}

/**
 * Which client a public request counts against.
 *
 * The RIGHTMOST X-Forwarded-For entry is the address Google's front end appended;
 * anything to its left was supplied by the client and is spoofable.
 * UNVERIFIED ON THE DEPLOYED ENDPOINT: which entry Cloud Run appends, and
 * whether a forged header can move the key, can only be confirmed after
 * resolveCommunityInvite is deployed (web task). Local tests cover the parsing, not
 * the network.
 *
 * IPv6 is keyed by /64 (one subscriber's allocation), so rotating addresses inside it
 * does not reset the limit. Unparseable input shares one bucket rather than getting
 * a free pass.
 */
export function rateKeyFromRequest(p: { xForwardedFor: string | undefined; ip: string | undefined }): string {
  const rightmost = p.xForwardedFor?.split(',').map((s) => s.trim()).filter(Boolean).pop();
  const raw = (rightmost ?? p.ip ?? '').trim();
  const mapped = raw.toLowerCase().startsWith('::ffff:') ? raw.slice(7) : raw;
  const v4 = ipv4(mapped);
  if (v4) return `ip:${v4}`;
  const v6 = ipv6Groups(raw);
  if (v6) return `ip6:${v6.slice(0, 4).join(':')}`;
  return 'ip:unknown';
}

// ── Invite URL ───────────────────────────────────────────────────────────────

/**
 * `<baseUrl>/c/<token>`, with baseUrl from config/appLinks. Null unless the base
 * is a bare https origin: a path, query or plain http in config is a misconfiguration
 * that would otherwise be baked into every shared link.
 */
export function buildInviteUrl(baseUrl: unknown, token: string): string | null {
  if (typeof baseUrl !== 'string' || !baseUrl) return null;
  let u: URL;
  try { u = new URL(baseUrl); } catch { return null; }
  if (u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash || u.username || u.password) return null;
  return `${u.origin}/c/${token}`;
}

// ── In-memory first pass ─────────────────────────────────────────────────────

/**
 * Per-instance sliding window.
 *
 * NOT THE LIMIT. This lives in one function instance's memory, resets on every
 * cold start, and cannot see the other instances. With maxInstances: 10, one key can
 * pass it ~10x over. It exists only to reject a flood before any Firestore I/O.
 * The Firestore window in rateLimit.ts is authoritative. Never remove or bypass that
 * window on the strength of this counter.
 */
export class SlidingWindowCounter {
  private hits = new Map<string, number[]>();
  constructor(private opts: { limit: number; windowMs: number; maxKeys: number }) {}

  get size() { return this.hits.size; }

  /** Records a hit; true if the key is still within its limit. */
  hit(key: string, now: number): boolean {
    const since = now - this.opts.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    const allowed = recent.length < this.opts.limit;
    if (allowed) recent.push(now);
    this.hits.delete(key); // re-insert so Map order tracks recency for eviction
    this.hits.set(key, recent);
    while (this.hits.size > this.opts.maxKeys) {
      const oldest = this.hits.keys().next().value as string;
      this.hits.delete(oldest);
    }
    return allowed;
  }
}

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  OFFER_TTL_MS,
  checkCancel,
  checkOffer,
  checkResponse,
  isLive,
  offerNotice,
  resultNotice,
  type OfferDoc,
} from '../ownerTransferCore';

const NOW = 1_000_000;
const community = { type: 'community', ownerId: 'owner', members: ['owner', 'm1', 'm2'] };
const offer = (over: Partial<OfferDoc> = {}): OfferDoc => ({
  fromUid: 'owner', toUid: 'm1', status: 'pending', expiresAtMs: NOW + OFFER_TTL_MS, ...over,
});

describe('checkOffer', () => {
  const base = { uid: 'owner', toUid: 'm1', community, existing: null, nowMs: NOW };
  it('lets the owner offer to a member', () => expect(checkOffer(base)).toBeNull());
  it('refuses a non-owner', () => expect(checkOffer({ ...base, uid: 'm2' })).toBe('not-owner'));
  it('refuses offering to yourself', () => expect(checkOffer({ ...base, toUid: 'owner' })).toBe('bad-target'));
  it('refuses a malformed target', () => {
    expect(checkOffer({ ...base, toUid: '' })).toBe('bad-target');
    expect(checkOffer({ ...base, toUid: 'a/b' })).toBe('bad-target');
    expect(checkOffer({ ...base, toUid: 42 })).toBe('bad-target');
  });
  it('refuses someone who is not a member', () => expect(checkOffer({ ...base, toUid: 'stranger' })).toBe('target-not-member'));
  it('refuses a suspended community', () =>
    expect(checkOffer({ ...base, community: { ...community, status: 'suspended' } })).toBe('suspended'));
  it('refuses a missing or non-community chat', () => {
    expect(checkOffer({ ...base, community: null })).toBe('not-a-community');
    expect(checkOffer({ ...base, community: { ...community, type: 'group' } })).toBe('not-a-community');
  });
  it('refuses a second offer while one is live', () =>
    expect(checkOffer({ ...base, existing: offer() })).toBe('offer-pending'));
  it('lets an expired offer be replaced', () =>
    expect(checkOffer({ ...base, existing: offer({ expiresAtMs: NOW - 1 }) })).toBeNull());
});

describe('checkResponse', () => {
  const base = { uid: 'm1', accept: true, community, offer: offer(), nowMs: NOW };
  it('lets the recipient accept', () => expect(checkResponse(base)).toBeNull());
  it('lets the recipient decline', () => expect(checkResponse({ ...base, accept: false })).toBeNull());
  it('refuses anyone else answering', () => {
    expect(checkResponse({ ...base, uid: 'm2' })).toBe('not-recipient');
    expect(checkResponse({ ...base, uid: 'owner' })).toBe('not-recipient');
  });
  it('refuses when there is no offer', () => expect(checkResponse({ ...base, offer: null })).toBe('no-offer'));
  it('refuses accepting an expired offer, but allows declining it', () => {
    const expired = offer({ expiresAtMs: NOW });
    expect(checkResponse({ ...base, offer: expired })).toBe('offer-expired');
    expect(checkResponse({ ...base, offer: expired, accept: false })).toBeNull();
  });
  it('voids the offer if the owner changed meanwhile', () =>
    expect(checkResponse({ ...base, community: { ...community, ownerId: 'someone-else' } })).toBe('owner-changed'));
  it('refuses if the recipient left the community', () =>
    expect(checkResponse({ ...base, community: { ...community, members: ['owner', 'm2'] } })).toBe('recipient-left'));
  it('refuses accepting into a suspended community', () =>
    expect(checkResponse({ ...base, community: { ...community, status: 'suspended' } })).toBe('suspended'));
});

describe('checkCancel', () => {
  it('lets the owner cancel', () => expect(checkCancel({ uid: 'owner', community, offer: offer() })).toBeNull());
  it('refuses a non-owner', () => expect(checkCancel({ uid: 'm1', community, offer: offer() })).toBe('not-owner'));
  it('refuses when nothing is pending', () => expect(checkCancel({ uid: 'owner', community, offer: null })).toBe('no-offer'));
});

describe('isLive', () => {
  it('is live only while pending and unexpired', () => {
    expect(isLive(offer(), NOW)).toBe(true);
    expect(isLive(offer({ expiresAtMs: NOW }), NOW)).toBe(false);
    expect(isLive(null, NOW)).toBe(false);
  });
});

describe('notices', () => {
  it('names the community and the person, in both languages', () => {
    const he = offerNotice('he', { communityName: 'צוות', fromName: 'דנה' });
    const en = offerNotice('en', { communityName: 'Crew', fromName: 'Dana' });
    expect(he.title).toContain('צוות');
    expect(he.message).toContain('דנה');
    expect(en.title).toContain('Crew');
    expect(en.message).toContain('Dana');
  });
  it('falls back when names are missing, and clips absurd ones', () => {
    expect(offerNotice('en', { communityName: undefined, fromName: '' }).message).toContain('Someone');
    expect(offerNotice('en', { communityName: 'x', fromName: 'y'.repeat(500) }).message.length).toBeLessThan(200);
  });
  it('says whether the member accepted', () => {
    expect(resultNotice('en', { communityName: 'C', toName: 'Sam', accepted: true }).message).toContain('accepted');
    expect(resultNotice('en', { communityName: 'C', toName: 'Sam', accepted: false }).message).toContain('declined');
  });
});

describe('the callables (source)', () => {
  const src = readFileSync(join(__dirname, '..', 'ownerTransfer.ts'), 'utf8');
  it('are exported from index.ts', () => {
    const index = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8');
    expect(index).toMatch(/export \* from '\.\/communities\/ownerTransfer'/);
  });
  it('authenticate and require a verified email before any read', () => {
    for (const fn of ['requestOwnershipTransfer', 'respondOwnershipTransfer', 'cancelOwnershipTransfer']) {
      const body = src.slice(src.indexOf(`export const ${fn}`));
      expect(body.indexOf('requireAuth(')).toBeGreaterThan(-1);
      expect(body.indexOf('requireAuth(')).toBeLessThan(body.indexOf('.get('));
      expect(body.indexOf('assertVerifiedEmail(')).toBeLessThan(body.indexOf('.get('));
    }
  });
  it('changes ownerId only inside the accept path', () => {
    expect(src.match(/ownerId: uid/g)).toHaveLength(1);
    expect(src).toMatch(/if \(accept\) tx\.update\(chatRef, \{ ownerId: uid \}\)/);
  });
  it('keeps the previous owner a member (never touches members)', () => {
    expect(src).not.toMatch(/members:/);
  });
});

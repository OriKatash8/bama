import { offeredCategoriesByProject, hasUnofferedMatchingSlot, isOfferedSlot } from '../unoffered';
import type { SentOfferEntry } from '@features/offers/hooks/useSentOffers';
import type { ProjectRequest } from '@core/types/project';
import type { Timestamp } from '@core/types/common';

const TS = { seconds: 0, nanoseconds: 0 } as Timestamp;

const VIDEO = 'Video Photographer';
const SOUND = 'Sound Recordist';

const SKILLS = [
  { role: 'videographer', specializations: ['general', 'drone'] },
  { role: 'sound', specializations: ['general'] },
];

function priceEntry(projectId: string, category: string): SentOfferEntry {
  return {
    kind: 'price',
    id: `p-${projectId}-${category}`,
    data: {
      id: `p-${projectId}-${category}`,
      projectId,
      category,
      professionalId: 'me',
      price: 100,
      status: 'pending',
      createdAt: TS,
    },
    projectTitle: null,
    ts: 0,
  };
}

function bundleEntry(projectId: string, categories: string[]): SentOfferEntry {
  return {
    kind: 'bundle',
    id: `b-${projectId}`,
    data: {
      id: `b-${projectId}`,
      projectId,
      professionalId: 'me',
      slots: categories.map((category) => ({ category })),
      bundlePrice: 100,
      individualTotal: 200,
      offerIds: [],
      status: 'pending',
      createdAt: TS,
    },
    projectTitle: null,
    ts: 0,
  };
}

function project(crewSlots: ProjectRequest['crewSlots'], filledSlots: ProjectRequest['filledSlots'] = []): ProjectRequest {
  return { id: 'proj1', crewSlots, filledSlots } as ProjectRequest;
}

describe('offeredCategoriesByProject', () => {
  it('is empty for a professional who has sent nothing', () => {
    expect(offeredCategoriesByProject([]).size).toBe(0);
  });

  it('folds price offers into one set per project', () => {
    const map = offeredCategoriesByProject([priceEntry('a', VIDEO), priceEntry('a', SOUND), priceEntry('b', VIDEO)]);
    expect(map.get('a')).toEqual(new Set([VIDEO, SOUND]));
    expect(map.get('b')).toEqual(new Set([VIDEO]));
  });

  it("reads a bundle's categories off its slots", () => {
    // Individual offers inside a bundle are excluded from `offers` upstream, so
    // the bundle entry is the ONLY place those categories appear.
    const map = offeredCategoriesByProject([bundleEntry('a', [VIDEO, SOUND])]);
    expect(map.get('a')).toEqual(new Set([VIDEO, SOUND]));
  });

  it('merges price and bundle offers on the same project', () => {
    const map = offeredCategoriesByProject([priceEntry('a', VIDEO), bundleEntry('a', [SOUND])]);
    expect(map.get('a')).toEqual(new Set([VIDEO, SOUND]));
  });
});

describe('hasUnofferedMatchingSlot', () => {
  it('is true when a matching vacant slot has no offer against it', () => {
    const p = project([{ category: VIDEO, quantity: 1 }]);
    expect(hasUnofferedMatchingSlot(p, SKILLS, undefined)).toBe(true);
  });

  it('is false once every matching category has been bid on', () => {
    const p = project([{ category: VIDEO, quantity: 1 }]);
    expect(hasUnofferedMatchingSlot(p, SKILLS, new Set([VIDEO]))).toBe(false);
  });

  it('keeps the project while a DIFFERENT role is still open — the bug this fixes', () => {
    const p = project([
      { category: VIDEO, quantity: 1 },
      { category: SOUND, quantity: 1 },
    ]);
    // Bid on video only: the sound slot must keep the notice alive.
    expect(hasUnofferedMatchingSlot(p, SKILLS, new Set([VIDEO]))).toBe(true);
    expect(hasUnofferedMatchingSlot(p, SKILLS, new Set([VIDEO, SOUND]))).toBe(false);
  });

  it('is false when a vacant slot exists but does not match the pro', () => {
    const p = project([{ category: 'Graphic Designer', quantity: 1 }]);
    expect(hasUnofferedMatchingSlot(p, SKILLS, undefined)).toBe(false);
  });

  it('respects capability: a drone slot needs the drone specialization', () => {
    const droneOnly = [{ role: 'videographer', specializations: ['general'] }];
    const p = project([{ category: VIDEO, quantity: 1, requiredCapability: 'drone' }]);
    expect(hasUnofferedMatchingSlot(p, droneOnly, undefined)).toBe(false);
    expect(hasUnofferedMatchingSlot(p, SKILLS, undefined)).toBe(true);
  });

  it('is false when the only matching slot is already filled', () => {
    const p = project([{ category: VIDEO, quantity: 1 }], [{ category: VIDEO, professionalId: 'someone' }]);
    expect(hasUnofferedMatchingSlot(p, SKILLS, undefined)).toBe(false);
  });

  it('skips the skill check for direct invites (roleSkills === null)', () => {
    const p = project([{ category: 'Graphic Designer', quantity: 1 }]);
    expect(hasUnofferedMatchingSlot(p, null, undefined)).toBe(true);
    // …but an already-bid category still closes it out.
    expect(hasUnofferedMatchingSlot(p, null, new Set(['Graphic Designer']))).toBe(false);
  });

  it('documents the known limit: capability is invisible to the offer check', () => {
    // A drone slot and a general slot in one category. Bidding on either records
    // only the category, so the project leaves the board with one still vacant.
    const p = project([
      { category: VIDEO, quantity: 1 },
      { category: VIDEO, quantity: 1, requiredCapability: 'drone' },
    ]);
    expect(hasUnofferedMatchingSlot(p, SKILLS, new Set([VIDEO]))).toBe(false);
  });
});

/**
 * The modal's two lists diverge on already-offered slots: the details list marks
 * them, the bid form drops them. Both read the same per-category set, so the only
 * thing worth pinning is that they disagree in the right direction.
 */
describe('offered-slot split between the details and bid lists', () => {
  const slots = [
    { category: VIDEO, quantity: 1 },
    { category: SOUND, quantity: 1 },
  ];
  it('marks the offered slot in the details list but keeps it', () => {
    const offered = new Set([VIDEO]);
    expect(slots.map((s) => isOfferedSlot(s, offered))).toEqual([true, false]);
    expect(slots.length).toBe(2); // nothing removed
  });

  it('drops the offered slot from the bid form', () => {
    const offered = new Set([VIDEO]);
    expect(slots.filter((s) => !isOfferedSlot(s, offered)).map((s) => s.category)).toEqual([SOUND]);
  });

  it('leaves both lists intact when nothing has been offered', () => {
    expect(slots.filter((s) => !isOfferedSlot(s, undefined))).toHaveLength(2);
    expect(slots.map((s) => isOfferedSlot(s, undefined))).toEqual([false, false]);
  });
});

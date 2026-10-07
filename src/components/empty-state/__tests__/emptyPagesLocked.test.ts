import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * An empty page ends with its empty state: no scrolling down past it. On each
 * screen the page's scroll is switched off while the empty state shows AND the
 * empty state reports that its text fits the screen (onFitsChange) — on a phone
 * too short for it, the page still scrolls so the button stays reachable.
 */

const APP = join(__dirname, '..', '..', '..', 'app');
const read = (...p: string[]) => readFileSync(join(APP, ...p), 'utf8');
const squash = (s: string) => s.replace(/\s+/g, ' ');

const cases: { name: string; file: string[]; lock: RegExp[]; blocks: number; fitted: boolean }[] = [
  {
    name: 'client — my projects + price offers',
    file: ['(client)', '(tabs)', 'projects', 'index.tsx'],
    lock: [
      /const tabEmpty = segment === 'projects' \? !requestsLoading && activeRequests\.length === 0 : !\(offersLoading \|\| bundlesLoading\) && combinedOffers\.length === 0;/,
      /const locked = tabEmpty && emptyFits;/,
      /scrollEnabled=\{!locked\} bounces=\{!locked\}/,
    ],
    blocks: 2, fitted: true,
  },
  {
    name: 'pro — notice board',
    file: ['(professional)', '(tabs)', 'dashboard', 'index.tsx'],
    lock: [
      /const boardEmpty = onBoard && !isLoading && displayed\.length === 0;/,
      /const locked = boardEmpty && emptyFits;/,
      /scrollEnabled=\{!locked\} bounces=\{!locked\}/,
    ],
    blocks: 1, fitted: true,
  },
  {
    name: 'pro — chats',
    file: ['(professional)', '(tabs)', 'chats', 'index.tsx'],
    lock: [/scrollEnabled=\{!\(\(active === 'chats' && !chatsLoading && !hasChats && emptyFits\) \|\| coursesEmptyShown && emptyFits\)\}/,
      /const coursesEmptyShown = active === 'courses' && coursesLoaded && courses\.length === 0;/],
    // The chats-tab state (bubbles) fits to the screen; the Courses "coming soon" one (listings) has a fixed illustration.
    blocks: 2, fitted: true,
  },
  {
    name: 'client — chats',
    file: ['(client)', '(tabs)', 'chats', 'index.tsx'],
    lock: [/scrollEnabled=\{loading \|\| hasChats \|\| !emptyFits\}/],
    blocks: 1, fitted: true,
  },
  {
    // The listings illustration has a fixed height (no fitToScreen); the fit check alone decides.
    name: 'pro — marketplace',
    file: ['(professional)', '(tabs)', 'marketplace', 'index.tsx'],
    lock: [/const locked = !!empty && emptyFits;/, /scrollEnabled=\{!locked\} bounces=\{!locked\}/],
    blocks: 1, fitted: false,
  },
];

describe.each(cases)('$name', ({ file, lock, blocks: count, fitted }) => {
  const src = squash(read(...file));
  it('locks the page while the empty state shows and fits', () => {
    for (const re of lock) expect(src).toMatch(re);
  });
  it('every empty state reports whether it fits', () => {
    const blocks = src.split('<AnimatedEmptyState').slice(1).map((b) => b.slice(0, b.indexOf('/>')));
    expect(blocks).toHaveLength(count);
    for (const b of blocks) {
      expect(b).toMatch(/onFitsChange=\{setEmptyFits\}/);
      if (fitted && !/variant="listings"/.test(b)) expect(b).toMatch(/fitToScreen=\{\{ bottomInset: /);
    }
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every list that shows other people filters by side (demoSides.ts). Behaviour
 * is in demoSides.test.ts; this pins that each surface actually applies it.
 */
const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CASES: [string, RegExp][] = [
  ['src/features/crew/hooks/useSearchProfessionals.ts', /results\.filter\(\(r\) => isSameSide\(demo, currentUserId, r\.user\.id\)\)/],
  ['src/features/crew/hooks/useUnifiedSearch.ts', /results\.filter\(\(r\) => isSameSide\(demo, currentUserId, r\.user\.id\)\)/],
  ['src/features/noticeboard/hooks/useNoticeboard.ts', /isSameSide\(demo, currentUserId, r\.clientId\)/],
  ['src/features/marketplace/hooks/useMarketplaceListings.ts', /isSameSide\(demo, me, l\.posterId\)/],
  ['src/features/chat/hooks/useCommunityDiscovery.ts', /discoverCommunities\.filter\(\(c\) => isCommunityOnSide\(demo, userId, c\.id, c\.ownerId\)\)/],
  ['src/app/(client)/(tabs)/home/summary.tsx', /users\.filter\(\(u\) => onMySide\(useAuthStore\.getState\(\)\.user\?\.id, u\.id\)\)/],
  ['src/app/(client)/(tabs)/browse/profile/[userId].tsx', /if \(!user \|\| !profile \|\| !onMySide\) \{/],
  ['src/app/(professional)/(tabs)/browse/profile/[userId].tsx', /if \(!user \|\| !profile \|\| !onMySide\) \{/],
  ['src/features/admin/useRegistrationStats.ts', /!demoUids\.includes\(u\.id\)/],
  ['src/app/(professional)/(tabs)/chats/index.tsx', /allCourses\.filter\(\(c\) => isCourseOnSide\(demoConfig, user\?\.id, c\.demoOnly\)\)/],
  ['src/app/admin/courses.tsx', /const demoOnly = useDemoStore\.getState\(\)\.config\.uids\.includes\(req\.submittedBy\);[\s\S]{0,120}\.\.\.\(demoOnly \? \{ demoOnly: true \} : \{\}\)/],
  ['src/features/admin/dashboard/counts.ts', /where\(documentId\(\), 'not-in', demoUids\)/],
];

it.each(CASES)('%s filters by side', (file, re) => {
  expect(read(file)).toMatch(re);
});

it('useAuth keeps the config live for as long as someone is signed in', () => {
  const src = read('src/core/hooks/useAuth.ts');
  expect(src).toMatch(/subscribeToDocument<Record<string, unknown>>\('config\/demoAccounts'/);
  expect(src).toMatch(/useDemoStore\.getState\(\)\.setConfig\(parseDemoConfig\(data\)\)/);
});

it('the Courses tab is switched off for everyone until after release (flip COURSES_TAB_ENABLED to bring it back)', () => {
  const src = read('src/app/(professional)/(tabs)/chats/index.tsx');
  expect(src).toMatch(/^const COURSES_TAB_ENABLED = false;$/m);
  expect(src).toMatch(/const TAB_KEYS: TabKey\[\] = COURSES_TAB_ENABLED \? \['chats', 'communities', 'courses'\] : \['chats', 'communities'\];/);
});

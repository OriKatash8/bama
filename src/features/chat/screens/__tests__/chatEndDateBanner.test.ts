import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The project chat shows EndDateBanner near the end date, from the project doc's
 * live endDate/status/slotHolders. Behaviour is in endDateNotice.test.ts and
 * EndDateBanner.test.tsx; this pins the wiring.
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('reads endDate and the hires from the live project doc', () => {
  const listener = SRC.slice(SRC.indexOf("doc(db, 'projects', chatProjectId)"));
  expect(listener).toMatch(/setProjectEndDate\(/);
  expect(listener).toMatch(/slotHolders/);
});

it('decides visibility with endDateNotice', () => {
  expect(SRC).toMatch(/endDateNotice\(\{/);
});

it('renders the banner only in a live project chat', () => {
  expect(SRC).toMatch(
    /chatType === 'group' && !!chatProjectId && !isReadOnly && !chatArchived && !endDateBannerDismissed && endNotice\.show/,
  );
  expect(SRC).toMatch(/<EndDateBanner/);
});

it('the client edit button opens the project details', () => {
  const banner = SRC.slice(SRC.indexOf('<EndDateBanner'));
  expect(banner.slice(0, 600)).toMatch(/project-details\?projectId=\$\{chatProjectId\}/);
  expect(banner.slice(0, 600)).toMatch(/isClient=\{projectClientId === currentUserId\}/);
});

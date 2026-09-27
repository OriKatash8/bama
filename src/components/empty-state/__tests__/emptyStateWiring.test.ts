import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The four empty states moved to AnimatedEmptyState WITHOUT changing what they
 * say or do: each block still carries exactly its old i18n keys and routes.
 * (The component itself is covered by AnimatedEmptyState.test.)
 */

const APP = join(__dirname, '..', '..', '..', 'app');
const read = (...p: string[]) => readFileSync(join(APP, ...p), 'utf8');

/** Every <AnimatedEmptyState …/> block in a file, in order. */
function blocks(src: string): string[] {
  const out: string[] = [];
  let i = src.indexOf('<AnimatedEmptyState');
  while (i !== -1) {
    // The component's own closing `/>` sits alone on its line; an inner
    // `<Plus … />` does not end the block.
    const m = /\n\s*\/>/.exec(src.slice(i));
    const end = m ? i + m.index : src.length;
    out.push(src.slice(i, end));
    i = src.indexOf('<AnimatedEmptyState', end);
  }
  return out;
}

const cases: { name: string; file: string[]; index: number; variant: string; must: string[]; above?: string }[] = [
  {
    name: 'client — הפרויקטים שלי', file: ['(client)', '(tabs)', 'projects', 'index.tsx'], index: 0, variant: 'tiles',
    above: 'newOffersCount > 0',
    must: ["'chats_page.empty_projects_title'", "'chats_page.empty_projects_desc'", "'chats_page.empty_projects_primary'",
      "router.push('/(client)/(tabs)/home')", "'chats_page.empty_projects_secondary'", "router.push('/(client)/(tabs)/browse')", '<Plus'],
  },
  {
    name: 'client — הצעות מחיר', file: ['(client)', '(tabs)', 'projects', 'index.tsx'], index: 1, variant: 'tiles',
    above: 'offers.length > 0 || bundles.length > 0',
    must: ["'chats_page.empty_offers_title'", "'chats_page.empty_offers_desc'", "'chats_page.empty_offers_primary'",
      "switchSegment('projects')", "'chats_page.empty_projects_secondary'", "router.push('/(client)/(tabs)/browse')"],
  },
  {
    name: 'client chats', file: ['(client)', '(tabs)', 'chats', 'index.tsx'], index: 0, variant: 'bubbles',
    must: ["'chats.empty_client_title'", "'chats.empty_client_desc'", "'chats.empty_client_primary'",
      "router.push('/(client)/(tabs)/home')", "'chats.empty_client_secondary'", "router.push('/(client)/(tabs)/browse')", '<Plus'],
  },
  {
    name: 'pro chats', file: ['(professional)', '(tabs)', 'chats', 'index.tsx'], index: 0, variant: 'bubbles',
    must: ["'chats.empty_pro_title'", "'chats.empty_pro_incomplete_desc'", "'chats.empty_pro_complete_desc'",
      "'chats.empty_pro_incomplete_primary'", "router.push('/(professional)/(tabs)/profile?edit=1')",
      "'chats.empty_pro_complete_primary'", "'chats.empty_pro_secondary_board'", "router.push('/(professional)/(tabs)/dashboard')",
      // A complete profile has no secondary link — none is invented.
      ': undefined}'],
  },
  {
    name: 'pro notice board', file: ['(professional)', '(tabs)', 'dashboard', 'index.tsx'], index: 0, variant: 'board',
    above: '(notifPrompt.visible && pendingCount > 0) || biddable.length > 0',
    must: ["'noticeboard.no_projects'", "'noticeboard.check_back'", "'noticeboard.upgrade_profile_hint'",
      "'noticeboard.upgrade_profile_btn'", "router.push('/(professional)/(tabs)/profile?edit=1')",
      // Only for a pro with no active projects, as before.
      '!activeProjectsLoading && activeProjects.length === 0'],
  },
];

it.each(cases)('$name uses the $variant empty state with its original copy and routes', ({ file, index, variant, must }) => {
  const src = read(...file);
  const block = blocks(src)[index];
  expect(block).toBeDefined();
  expect(block).toContain(`variant="${variant}"`);
  for (const m of must) expect(block).toContain(m);
});

it.each(cases)('$name spans the screen: its bleed equals the sheet padding it sits in', ({ file, index }) => {
  const src = read(...file);
  const bleed = /bleed=\{(\d+)\}/.exec(blocks(src)[index])?.[1];
  const sheet = /\n  sheet: \{[^}]*?paddingHorizontal: (\d+)/.exec(src)?.[1];
  expect(bleed).toBeDefined();
  expect(bleed).toBe(sheet);
});

it.each([
  ['(client)', '(tabs)', 'projects', 'index.tsx'],
  ['(client)', '(tabs)', 'chats', 'index.tsx'],
  ['(professional)', '(tabs)', 'chats', 'index.tsx'],
])('%s/%s/%s/%s no longer uses the old EmptyState', (...p) => {
  expect(read(...p)).not.toMatch(/@components\/ui\/EmptyState/);
});

it.each(cases)('$name meets the sheet: top bleed = the sheet paddingTop, corners = the sheet radius', ({ file, index, above }) => {
  const src = read(...file);
  const block = blocks(src)[index];
  const sheet = /\n  sheet: \{[^}]*\}/.exec(src)![0];
  const paddingTop = /paddingTop: (\d+)/.exec(sheet)![1];
  const radius = /borderTopLeftRadius: (\d+)/.exec(sheet)![1];
  // The non-zero branch of bleedTop is the sheet's paddingTop.
  expect(block).toMatch(new RegExp(`bleedTop=\\{[^}]*\\b${paddingTop}\\}`));
  expect(block).toContain(`radius={${radius}}`);
  if (above) {
    // Pulled up only when nothing sits above: the condition names exactly that,
    // and the same condition gates that element in the screen.
    expect(block).toContain(`bleedTop={${above} ? 0 : ${paddingTop}}`);
  }
});

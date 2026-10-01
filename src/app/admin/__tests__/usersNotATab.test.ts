import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Users and Projects are reached from the dashboard's tiles, not the tab bar. */
const SRC = readFileSync(join(__dirname, '..', '_layout.tsx'), 'utf8');

it('the users screen is hidden from the tab bar', () => {
  expect(SRC).toMatch(/<Tabs\.Screen name="users" options=\{\{ href: null \}\} \/>/);
});

it('the projects screens are hidden from the tab bar', () => {
  expect(SRC).toMatch(/<Tabs\.Screen name="projects" options=\{\{ href: null \}\} \/>/);
  expect(SRC).toMatch(/<Tabs\.Screen name="project-chat" options=\{\{ href: null \}\} \/>/);
});

import fs from 'fs';
import path from 'path';

/**
 * Colours come from the communityAdmin palette only, like the community
 * dashboard: the admin dashboard, the shared admin kit and every admin page.
 * (_layout.tsx is excluded: it styles the app-wide floating tab bar.)
 */
const repo = path.join(__dirname, '../../../../..');
const sources = (dir: string, skip: (name: string) => boolean = () => false): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '__tests__' || skip(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) out.push(full);
    }
  };
  walk(path.join(repo, dir));
  return out;
};

const files = [
  ...sources('src/features/admin/dashboard'),
  ...sources('src/features/admin/ui'),
  ...sources('src/app/admin', (n) => n === '_layout.tsx'),
];

it('finds the admin sources', () => {
  expect(files.length).toBeGreaterThan(12);
});

it.each(files.map((f) => [path.relative(repo, f)]))('%s inlines no hex or rgba colour', (rel) => {
  expect(fs.readFileSync(path.join(repo, rel), 'utf8').match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)).toBeNull();
});

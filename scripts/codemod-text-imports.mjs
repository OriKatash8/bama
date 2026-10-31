#!/usr/bin/env node
/**
 * Mechanical codemod: take `Text` and `TextInput` out of the `react-native` import
 * and import them from '@components/ui/Text' instead (the drop-ins that really
 * apply the app's fonts — see src/components/ui/Text.tsx).
 *
 *   node scripts/codemod-text-imports.mjs          # rewrite in place
 *   node scripts/codemod-text-imports.mjs --dry    # report only
 *
 * Deterministic and idempotent, so after merging main it can simply be re-run.
 * Left alone and reported: aliased imports (`Text as X`), default/namespace
 * imports from react-native, tests, AppText and the component itself.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parse } from '@babel/parser';

const DRY = process.argv.includes('--dry');
const EXCLUDE = new Set(['src/components/ui/Text.tsx', 'src/components/ui/AppText.tsx']);
const TARGET = new Set(['Text', 'TextInput']);

const files = execSync(
  `grep -rlE "from 'react-native'" src --include='*.tsx' --include='*.ts' | grep -v __tests__`,
  { encoding: 'utf8' },
).split('\n').filter(Boolean).sort().filter((f) => !EXCLUDE.has(f));

const changed = [];
const reported = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let ast;
  try { ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] }); }
  catch (e) { reported.push(`${file}: parse error`); continue; }

  const imports = ast.program.body.filter((n) => n.type === 'ImportDeclaration' && n.source.value === 'react-native');
  const edits = [];
  const moved = [];
  for (const imp of imports) {
    if (imp.importKind === 'type') continue;
    const wanted = imp.specifiers.filter((s) => s.type === 'ImportSpecifier' && s.importKind !== 'type' && TARGET.has(s.imported.name));
    if (wanted.length === 0) continue;
    if (wanted.some((s) => s.local.name !== s.imported.name)) { reported.push(`${file}: aliased Text import, left alone`); continue; }
    if (imp.specifiers.some((s) => s.type !== 'ImportSpecifier')) { reported.push(`${file}: default/namespace react-native import, left alone`); continue; }
    const rest = imp.specifiers.filter((s) => !wanted.includes(s));
    const names = wanted.map((s) => s.imported.name).sort((a, b) => (a === 'Text' ? -1 : b === 'Text' ? 1 : 0));
    const newImport = `import { ${names.join(', ')} } from '@components/ui/Text';`;
    const rnImport = rest.length ? `import { ${rest.map((s) => src.slice(s.start, s.end)).join(', ')} } from 'react-native';\n` : '';
    // Multi-line originals stay multi-line.
    const multi = src.slice(imp.start, imp.end).includes('\n') && rest.length > 3;
    const rnText = rest.length && multi
      ? `import {\n${rest.map((s) => `  ${src.slice(s.start, s.end)},`).join('\n')}\n} from 'react-native';\n`
      : rnImport;
    edits.push({ start: imp.start, end: imp.end, text: `${rnText}${newImport}`.replace(/\n$/, '') });
    moved.push(...names);
  }
  if (!moved.length) continue;
  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (!DRY) writeFileSync(file, out);
  changed.push(`${file}  [${moved.join(', ')}]`);
}

console.log(JSON.stringify({ files: changed.length, reported }, null, 2));
if (process.argv.includes('--list')) console.log(changed.join('\n'));

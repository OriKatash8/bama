#!/usr/bin/env node
/**
 * Mechanical codemod: replace hand-written shadow and elevation style groups with the
 * shared helper, `...shadow({ ... })` from src/core/theme/shadow.ts.
 *
 *   node scripts/codemod-shadows.mjs            # rewrite in place
 *   node scripts/codemod-shadows.mjs --dry      # report only
 *
 * Deterministic and idempotent, so it can simply be re-run after merging main:
 * take main's version of a conflicted file, run this, done.
 *
 * Rules
 *  - An object literal is rewritten if it has at least one of shadowColor /
 *    shadowOffset / shadowOpacity / shadowRadius. Values may be any expression (theme
 *    colours, conditionals): the source text is copied unchanged. Only a shadowOffset
 *    that is not an object literal is reported under "skipped" and left alone.
 *  - `elevation` alone (z-order, no shadow props) is never touched, and neither is a
 *    block that switches the shadow off with `shadowOpacity: 0`.
 *  - Values are copied from the source text unchanged, so the iOS values are the
 *    same characters as before.
 *  - Only one-property-per-line blocks are rewritten; one-liners are reported.
 *  - ANDROID_NONE: blocks that never drew a shadow on Android (no own background)
 *    and must keep not drawing one -> `android: 'none'`.
 *  - SKIP: blocks left exactly as they are.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parse } from '@babel/parser';

const DRY = process.argv.includes('--dry');

const ANDROID_NONE = new Set([
  'src/features/marketplace/components/CheckoutModal.tsx::card', // gradient child, no own background
]);
const SKIP = new Set([
  // shadowColor is set inline from the tone; the block alone is not a full shadow.
  'src/components/empty-state/AnimatedEmptyState.tsx::ctaShadow',
]);

const SHADOW_KEYS = ['shadowColor', 'shadowOffset', 'shadowOpacity', 'shadowRadius'];
const ALL_KEYS = [...SHADOW_KEYS, 'elevation'];

const files = execSync(
  `grep -rlE "shadowColor|shadowOffset|shadowOpacity|shadowRadius" src --include='*.tsx' --include='*.ts' | grep -v __tests__ | grep -v "src/core/theme/"`,
  { encoding: 'utf8' },
).split('\n').filter(Boolean).sort();

const report = { rewritten: [], skipped: [], files: 0 };

function keyName(p) {
  if (p.type !== 'ObjectProperty' || p.computed) return null;
  return p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : null;
}

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  } catch (e) {
    report.skipped.push({ file, key: '*', why: `parse error: ${e.message}` });
    continue;
  }

  const edits = []; // { start, end, text }
  const lineOf = (pos) => src.slice(0, pos).split('\n').length;

  function visit(node, parentKey) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'ObjectExpression') tryObject(node, parentKey);
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => visit(c, node.type === 'ObjectProperty' ? keyName(node) : parentKey));
      else if (v && typeof v.type === 'string') visit(v, node.type === 'ObjectProperty' ? keyName(node) : parentKey);
    }
  }

  function tryObject(obj, parentKey) {
    const props = obj.properties.filter((p) => ALL_KEYS.includes(keyName(p)));
    if (!props.some((p) => SHADOW_KEYS.includes(keyName(p)))) return; // elevation alone: leave
    const id = `${file}::${parentKey ?? '?'}`;
    const where = `${file}:${lineOf(obj.start)}`;
    if (SKIP.has(id)) { report.skipped.push({ file, key: parentKey, why: 'explicit SKIP', where }); return; }
    if (obj.properties.some((p) => p.type === 'SpreadElement' && src.slice(p.start, p.end).startsWith('...shadow('))) return; // already done

    const spec = {};
    for (const p of props) {
      const name = keyName(p);
      const v = p.value;
      const text = src.slice(v.start, v.end); // any expression: copied unchanged, evaluated at runtime as before
      if (name === 'shadowColor') spec.color = text;
      else if (name === 'shadowOpacity') spec.opacity = text;
      else if (name === 'shadowRadius') spec.radius = text;
      else if (name === 'elevation') spec.elevation = text;
      else if (name === 'shadowOffset') {
        if (v.type !== 'ObjectExpression') { report.skipped.push({ file, key: parentKey, why: 'shadowOffset is not an object literal', where }); return; }
        for (const q of v.properties) {
          const qn = keyName(q);
          if (qn !== 'width' && qn !== 'height') { report.skipped.push({ file, key: parentKey, why: `shadowOffset.${qn ?? 'spread'} unsupported`, where }); return; }
          spec[qn === 'width' ? 'offsetX' : 'offsetY'] = src.slice(q.value.start, q.value.end);
        }
      }
    }

    // A shadow switched OFF (opacity 0) is left exactly as written.
    if (spec.opacity !== undefined && /^0(\.0+)?$/.test(spec.opacity)) { report.skipped.push({ file, key: parentKey, why: 'shadowOpacity 0 (disables the shadow)', where }); return; }

    // Only blocks written one property per line are rewritten (so the result is tidy
    // and the edit is a clean line replacement); one-liners are reported for hand edit.
    const alone = props.every((p) => /(^|\n)[ \t]*$/.test(src.slice(0, p.start)) && /^,?[ \t]*(\r?\n|$)/.test(src.slice(p.end)));
    if (!alone) { report.skipped.push({ file, key: parentKey, why: 'not one property per line (hand edit)', where }); return; }

    const first = props[0];
    const indent = /([ \t]*)$/.exec(src.slice(0, first.start))[1];
    const order = ['color', 'opacity', 'radius', 'offsetX', 'offsetY', 'elevation'];
    const fields = order.filter((k) => spec[k] !== undefined).map((k) => `${k}: ${spec[k]}`);
    if (ANDROID_NONE.has(id)) fields.push(`android: 'none'`);
    const call = `...shadow({ ${fields.join(', ')} })`;

    // Remove every shadow prop (with its trailing comma and the rest of its line).
    const ranges = props.map((p) => {
      let end = p.end;
      if (src[end] === ',') end++;
      const m = /^[ \t]*\n/.exec(src.slice(end));
      if (m) end += m[0].length;
      let start = p.start;
      const lead = /[ \t]*$/.exec(src.slice(0, start))[0];
      if (m) start -= lead.length; // whole line goes
      return { start, end, p };
    });
    ranges.forEach((r, i) => {
      edits.push({ start: r.start, end: r.end, text: i === 0 && ranges[0].end !== undefined ? `${indent}${call},\n` : '' });
    });
    report.rewritten.push({ file, key: parentKey, where, android: ANDROID_NONE.has(id) ? 'none' : 'shadow' });
  }

  visit(ast.program, null);
  if (edits.length === 0) continue;
  report.files++;

  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);

  if (!/from '@core\/theme\/shadow'/.test(out)) {
    const lastImport = [...ast.program.body].filter((n) => n.type === 'ImportDeclaration').pop();
    // Offset of the end of the last import in the ORIGINAL source, mapped through the edits.
    const shift = edits.filter((e) => e.end <= lastImport.end).reduce((s, e) => s + (e.text.length - (e.end - e.start)), 0);
    const at = lastImport.end + shift;
    out = out.slice(0, at) + `\nimport { shadow } from '@core/theme/shadow';` + out.slice(at);
  }
  if (!DRY) writeFileSync(file, out);
}

console.log(JSON.stringify({
  files: report.files,
  rewritten: report.rewritten.length,
  skipped: report.skipped,
  androidNone: report.rewritten.filter((r) => r.android === 'none').map((r) => `${r.file}::${r.key}`),
}, null, 2));
if (process.argv.includes('--list')) for (const r of report.rewritten) console.log(`${r.where}\t${r.key}\t${r.android}`);

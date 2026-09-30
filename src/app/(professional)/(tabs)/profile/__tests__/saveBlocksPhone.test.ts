import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The profile screen checks bio + equipment on save, shows the errors inline
 * and does not call save(). Behaviour of the pieces: profileContact.test.ts,
 * BioSectionContactError.test.tsx, ContentTabsContact.test.tsx.
 */
const SRC = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8');

it('validates before saving and returns without saving on a phone', () => {
  const fn = SRC.slice(SRC.indexOf('async function handleSave()'));
  const check = fn.indexOf('profileContactErrors(');
  expect(check).toBeGreaterThan(-1);
  expect(check).toBeLessThan(fn.indexOf('await save('));
  expect(fn.slice(0, fn.indexOf('await save('))).toMatch(/if \(contact\.any\) \{[\s\S]*return;/);
});

it('passes the errors to the bio and the equipment list', () => {
  const bio = SRC.slice(SRC.indexOf('<BioSection'), SRC.indexOf('/>', SRC.indexOf('<BioSection')));
  expect(bio).toMatch(/error=\{bioError \? t\('profile\.error_no_phone'\) : undefined\}/);
  expect(SRC).toMatch(/badEquipmentIndexes=\{badEquipment\}/);
});

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * rentalCompanies and rentalItems are written only by functions (Admin SDK).
 * Pins that no client write is ever allowed on them, and that reads are by
 * content — the behaviour itself is probed by scripts/probe-rental-rules.mjs.
 */
const root = join(__dirname, '..', '..', '..');
const strip = (text: string) => text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const firestore = strip(readFileSync(join(root, 'firestore.rules'), 'utf8'));
const storage = strip(readFileSync(join(root, 'storage.rules'), 'utf8'));

function block(rules: string, header: string): string {
  const start = rules.indexOf(header);
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = rules.indexOf('{', start + header.length); i < rules.length; i++) {
    if (rules[i] === '{') depth++;
    if (rules[i] === '}' && --depth === 0) return rules.slice(start, i + 1).replace(/\s+/g, ' ');
  }
  throw new Error(`unterminated ${header}`);
}

describe('rental rules', () => {
  it('rentalCompanies: readable when active (or by admin), never writable', () => {
    expect(block(firestore, 'match /rentalCompanies/{companyId}')).toBe(
      'match /rentalCompanies/{companyId} { allow read: if isAdmin() || (isAuth() && resource.data.active == true); allow write: if false; }',
    );
  });

  it('rentalItems: readable when visible (or by admin), never writable', () => {
    expect(block(firestore, 'match /rentalItems/{itemId}')).toBe(
      'match /rentalItems/{itemId} { allow read: if isAdmin() || (isAuth() && resource.data.visible == true); allow write: if false; }',
    );
  });

  it('their Storage folder is read-only to signed-in users', () => {
    expect(block(storage, 'match /rentalCompanies/{companyId}/{allPaths=**}')).toBe(
      'match /rentalCompanies/{companyId}/{allPaths=**} { allow read: if isAuth(); allow write: if false; }',
    );
  });
});

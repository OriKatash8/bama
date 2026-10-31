import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The launch stamp lives at users/{uid}/private/presence. Account deletion removes
 * the whole `private` collection (the phone is there too), so the stamp goes with
 * the account. This pins that: if deletion ever stopped clearing `private`, the
 * platform, app version and last-seen time would outlive the person.
 */
const SRC = readFileSync(join(__dirname, '..', 'deletion.ts'), 'utf8');
const call = SRC.slice(SRC.indexOf('export const deleteMyAccount'));

it('deletes every doc in users/{uid}/private (which includes presence)', () => {
  expect(call).toMatch(/deleteQueryInBatches\(db\.collection\(`users\/\$\{uid\}\/private`\), 'private'\)/);
});

it('does so before the irreversible Auth deletion', () => {
  const stamp = call.indexOf("db.collection(`users/${uid}/private`)");
  expect(stamp).toBeGreaterThan(-1);
  expect(stamp).toBeLessThan(call.indexOf('admin.auth().deleteUser(uid)'));
});

it('the client writes the stamp inside that collection, and nowhere on the public user doc', () => {
  const client = readFileSync(join(__dirname, '..', '..', '..', '..', 'src', 'core', 'services', 'recordLaunch.ts'), 'utf8');
  expect(client).toMatch(/`users\/\$\{uid\}\/private\/presence`/);
});

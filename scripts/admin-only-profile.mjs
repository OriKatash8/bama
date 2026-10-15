#!/usr/bin/env node
/**
 * Make the admin account admin-only: empty its professional skills and bio so it
 * is never a search result or a matched professional.
 *
 * Touches ONLY users/C1pd9uv64yOBYfrPaktXet7Pxfr2/profile/data, with update():
 *   roleSkills -> []      bio -> ""
 * Every other field stays (proProfileCompleted stays true, so switching to
 * professional mode does not force the profile-completion screen). Nothing is
 * deleted; the custom claim and admin access are not touched. Past projects,
 * reviews and offers are business history and are left as they are.
 *
 * Search needs a non-empty roleSkills (useSearchProfessionals / useUnifiedSearch)
 * and onProjectCreate matches on it, so an empty list removes the account from
 * both. The server also skips ADMIN_UIDS in onProjectCreate.
 *
 * Refuses to run for any uid but the admin's, and refuses to --apply unless
 * Firebase Auth still shows role:admin on it.
 *
 *   DRY RUN (default):  node scripts/admin-only-profile.mjs
 *   FOR REAL:           node scripts/admin-only-profile.mjs --apply
 *
 * Credentials: gcloud Application Default Credentials, like the other admin
 * scripts (gcloud auth application-default login).
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const ADMIN_UID = 'C1pd9uv64yOBYfrPaktXet7Pxfr2';
const PROJECT_ID = 'bama-af0a0';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const uidIdx = args.indexOf('--uid');
const uid = uidIdx >= 0 ? args[uidIdx + 1] : ADMIN_UID;
if (uid !== ADMIN_UID) {
  console.error(`Refusing: this script only runs for ${ADMIN_UID}, not ${uid}.`);
  process.exit(1);
}

const app = initializeApp({ projectId: PROJECT_ID });
const ref = getFirestore(app).doc(`users/${ADMIN_UID}/profile/data`);

const snap = await ref.get();
if (!snap.exists) {
  console.error(`${ref.path} does not exist — nothing to do (and nothing is created).`);
  process.exit(1);
}
const before = snap.data();
const roles = (before.roleSkills ?? []).map((r) => r.role);
console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${ref.path}`);
console.log('  roleSkills :', JSON.stringify(roles), '->', '[]');
console.log('  bio        :', JSON.stringify(before.bio ?? null), '->', '""');
console.log('  unchanged  :', Object.keys(before).filter((k) => k !== 'roleSkills' && k !== 'bio').join(', '));
console.log('  proProfileCompleted stays:', before.proProfileCompleted);

const already = roles.length === 0 && (before.bio ?? '') === '';
if (already) { console.log('Already admin-only — nothing to change.'); process.exit(0); }

if (!apply) { console.log('\nDry run only — nothing written. Re-run with --apply.'); process.exit(0); }

const claims = (await getAuth(app).getUser(ADMIN_UID)).customClaims ?? {};
if (claims.role !== 'admin') {
  console.error(`Refusing to apply: Auth claims for ${ADMIN_UID} are ${JSON.stringify(claims)}, expected role:admin.`);
  process.exit(1);
}

await ref.update({ roleSkills: [], bio: '' });
const after = (await ref.get()).data();
console.log('\nWritten. After:');
console.log('  roleSkills :', JSON.stringify(after.roleSkills));
console.log('  bio        :', JSON.stringify(after.bio));
console.log('  proProfileCompleted:', after.proProfileCompleted);
process.exit(0);

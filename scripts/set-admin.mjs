import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const uid = process.argv[2];
if (!uid) { console.error('Usage: node scripts/set-admin.mjs <UID>'); process.exit(1); }

initializeApp({ projectId: 'bama-af0a0' });

await getAuth().setCustomUserClaims(uid, { role: 'admin' });
console.log('✅ Admin role set for UID:', uid);

// Admins are on neither side of the demo-account isolation (firestore.rules
// oneSide, functions/src/demo.ts). The rules can't read another user's claims,
// so they read this list. Only when the demo config exists — nothing to do before.
const cfg = getFirestore().doc('config/demoAccounts');
if ((await cfg.get()).exists) {
  await cfg.update({ neutralUids: FieldValue.arrayUnion(uid) });
  console.log('✅ Added to config/demoAccounts.neutralUids');
}
process.exit(0);

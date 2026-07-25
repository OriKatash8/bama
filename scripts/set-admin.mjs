import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const uid = process.argv[2];
if (!uid) { console.error('Usage: node scripts/set-admin.mjs <UID>'); process.exit(1); }

initializeApp({ projectId: 'bama-af0a0' });

await getAuth().setCustomUserClaims(uid, { role: 'admin' });
console.log('✅ Admin role set for UID:', uid);
process.exit(0);

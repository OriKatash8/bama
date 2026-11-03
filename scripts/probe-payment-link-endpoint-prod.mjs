#!/usr/bin/env node
/**
 * DRAFT - NOT RUN. PRODUCTION check that the deployed paymentLinkConfirm refuses
 * everything that does not carry the shared secret. Run it after the function is
 * deployed (it is not yet: allowlisted in scripts/deploy-drift-allowlist.json).
 *
 *   node scripts/probe-payment-link-endpoint-prod.mjs --prod --url https://<region>-<project>.cloudfunctions.net/paymentLinkConfirm
 *
 * It NEVER sends a valid secret and never a body that could match a real link, so it
 * cannot settle anything. It checks, and prints, status codes only:
 *   GET                         -> 405
 *   POST, no secret             -> 401
 *   POST, wrong secret          -> 401
 *   POST, empty secret header   -> 401
 *   POST, wrong secret + junk   -> 401 (the body is not even read first)
 * and that no refusal echoes the secret header or says why it was refused.
 */
import './lib/requireProd.mjs'; // explicit --prod required, no default target

const url = process.argv[process.argv.indexOf('--url') + 1];
if (!url || !/^https:\/\/[a-z0-9.-]+\/paymentLinkConfirm$/i.test(url)) {
  console.error('pass --url https://<host>/paymentLinkConfirm');
  process.exit(2);
}

let failures = 0;
async function check(name, init, expected) {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    const leaks = /secret|unauthor|invalid|wrong|denied/i.test(text);
    const pass = res.status === expected && !leaks;
    if (!pass) failures++;
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}: ${res.status} (want ${expected})${leaks ? ' - body explains the refusal' : ''}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
}
const body = JSON.stringify({ paymentLinkProcessId: 'probe', amount: 1, transactionId: 'probe-never' });
const post = (headers) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });

console.log(`\npaymentLinkConfirm ${url}`);
await check('GET', { method: 'GET' }, 405);
await check('POST, no secret', post({}), 401);
await check('POST, wrong secret', post({ 'X-Bama-Secret': 'definitely-not-the-secret' }), 401);
await check('POST, empty secret', post({ 'X-Bama-Secret': '' }), 401);
await check('POST, wrong secret, junk body', { method: 'POST', headers: { 'X-Bama-Secret': 'nope' }, body: '{{{' }, 401);

console.log(failures ? `\n${failures} failed` : '\nall refused');
process.exit(failures ? 1 : 0);

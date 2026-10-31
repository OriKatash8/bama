/**
 * Every probe script must be told where it points: --emulator or --prod. There is NO
 * default target. A probe that "defaults to production" runs against live data the
 * moment someone forgets a flag (it happened: a rules probe meant for the emulator
 * created and deleted scratch accounts in production, 2026-10-31).
 *
 * Rules, all enforced before the script does anything else:
 *   - neither flag, or both          -> error, exit 2
 *   - a script that only makes sense against one target refuses the other flag
 *   - --prod while an emulator host is set in the environment -> error (the SDKs would
 *     quietly talk to the emulator while the operator believes it is production)
 *   - env-driven scripts (they pick the emulator from FIRESTORE_EMULATOR_HOST):
 *     --emulator needs that variable set, --prod needs it unset
 *
 * Use the side-effect imports at the top of a script:
 *   import './lib/requireEmulator.mjs';   // emulator-only probes
 *   import './lib/requireProd.mjs';       // production-only probes
 * or call requireProbeTarget('either', { envDriven }) for probes that support both.
 */
const EMULATOR_ENV = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'STORAGE_EMULATOR_HOST'];

export function evaluateProbeTarget({ argv, env, allow, envDriven = false, script = 'this probe' }) {
  const emulator = argv.includes('--emulator');
  const prod = argv.includes('--prod');
  const usage = allow === 'emulator' ? '--emulator' : allow === 'prod' ? '--prod' : '--emulator | --prod';
  const fail = (message) => ({ ok: false, message: `${script}: ${message}\nusage: node ${script} ${usage} [other options]` });

  if (emulator && prod) return fail('pass exactly one of --emulator / --prod, not both.');
  if (!emulator && !prod) return fail('no target given. There is no default: say --emulator or --prod.');
  if (allow === 'emulator' && prod) return fail('this probe runs against the EMULATORS only; --prod is not supported.');
  if (allow === 'prod' && emulator) return fail('this probe runs against PRODUCTION only; --emulator is not supported.');

  const emulatorEnvSet = EMULATOR_ENV.filter((k) => env[k]);
  if (prod && emulatorEnvSet.length) {
    return fail(`--prod, but ${emulatorEnvSet.join(', ')} is set in the environment, so the SDKs would talk to the emulator. Unset it.`);
  }
  if (emulator && envDriven && !env.FIRESTORE_EMULATOR_HOST) {
    return fail('--emulator, but FIRESTORE_EMULATOR_HOST is not set. Start the emulators and export it (e.g. FIRESTORE_EMULATOR_HOST=127.0.0.1:8080).');
  }
  return { ok: true, target: emulator ? 'emulator' : 'prod' };
}

/** Exits 2 with a message unless a valid explicit target was given. Returns 'emulator' | 'prod'. */
export function requireProbeTarget(allow, { envDriven = false, argv = process.argv, env = process.env, script } = {}) {
  const name = script ?? `scripts/${(argv[1] ?? 'probe').split('/').pop()}`;
  const r = evaluateProbeTarget({ argv: argv.slice(2), env, allow, envDriven, script: name });
  if (!r.ok) {
    console.error(`REFUSING TO RUN - ${r.message}`);
    process.exit(2);
  }
  return r.target;
}

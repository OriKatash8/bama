const withAndroidLtrLock = require('../withAndroidLtrLock');

const manifest = (applicationAttrs, rootAttrs) => ({
  manifest: { ...(rootAttrs ? { $: rootAttrs } : {}), application: [{ $: { 'android:name': '.MainApplication', ...applicationAttrs } }] },
});

it('sets supportsRtl="false" on the application tag', () => {
  const out = withAndroidLtrLock.lockLtr(manifest({}));
  expect(out.manifest.application[0].$['android:supportsRtl']).toBe('false');
  expect(out.manifest.application[0].$['android:name']).toBe('.MainApplication');
});

it('overrides an existing supportsRtl="true"', () => {
  const out = withAndroidLtrLock.lockLtr(manifest({ 'android:supportsRtl': 'true' }));
  expect(out.manifest.application[0].$['android:supportsRtl']).toBe('false');
});

it('adds tools:replace for supportsRtl and declares the tools namespace on the root', () => {
  const out = withAndroidLtrLock.lockLtr(manifest({}));
  expect(out.manifest.application[0].$['tools:replace']).toBe('android:supportsRtl');
  expect(out.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
});

it('merges into an existing tools:replace list and keeps an existing namespace', () => {
  const out = withAndroidLtrLock.lockLtr(manifest(
    { 'tools:replace': 'android:allowBackup, android:label' },
    { 'xmlns:tools': 'http://schemas.android.com/tools', 'xmlns:android': 'a' },
  ));
  expect(out.manifest.application[0].$['tools:replace']).toBe('android:allowBackup,android:label,android:supportsRtl');
  expect(out.manifest.$['xmlns:android']).toBe('a');
});

it('is idempotent', () => {
  const once = withAndroidLtrLock.lockLtr(manifest({}));
  const twice = withAndroidLtrLock.lockLtr(once);
  expect(twice.manifest.application[0].$['tools:replace']).toBe('android:supportsRtl');
});

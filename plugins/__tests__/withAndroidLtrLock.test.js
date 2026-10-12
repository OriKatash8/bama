const withAndroidLtrLock = require('../withAndroidLtrLock');

const manifest = (applicationAttrs) => ({
  manifest: { application: [{ $: { 'android:name': '.MainApplication', ...applicationAttrs } }] },
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

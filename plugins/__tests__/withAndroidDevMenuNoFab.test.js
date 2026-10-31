const withAndroidDevMenuNoFab = require('../withAndroidDevMenuNoFab');

const manifest = (metaData) => ({
  manifest: { application: [{ $: { 'android:name': '.MainApplication' }, ...(metaData ? { 'meta-data': metaData } : {}) }] },
});

const find = (m) => (m.manifest.application[0]['meta-data'] ?? []).filter((x) => x.$['android:name'] === 'EXDevMenuShowFloatingActionButton');

it('adds EXDevMenuShowFloatingActionButton=false to the application meta-data', () => {
  const found = find(withAndroidDevMenuNoFab.hideFab(manifest()));
  expect(found).toHaveLength(1);
  expect(found[0].$['android:value']).toBe('false');
});

it('replaces an existing value instead of adding a second entry', () => {
  const found = find(withAndroidDevMenuNoFab.hideFab(manifest([
    { $: { 'android:name': 'EXDevMenuShowFloatingActionButton', 'android:value': 'true' } },
    { $: { 'android:name': 'other', 'android:value': 'x' } },
  ])));
  expect(found).toHaveLength(1);
  expect(found[0].$['android:value']).toBe('false');
});

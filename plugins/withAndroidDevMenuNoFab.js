/**
 * Config plugin: hide the dev menu's floating action button on Android dev builds.
 *
 * iOS already hides it through `infoPlist.EXDevMenuShowFloatingActionButton:
 * false` in app.json. expo-dev-menu's Android side reads the same key from the
 * <application> meta-data instead (DevMenuPreferences.kt, `metaDataBool`), so
 * without this the grey gear bubble floats over every screen of a dev build —
 * and over the trash icon in the chats list in screenshots. expo-dev-menu only
 * exists in debug builds, so release manifests carry a harmless unused entry.
 * The menu itself is still reachable (shake, or the dev client's own UI).
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const KEY = 'EXDevMenuShowFloatingActionButton';

function hideFab(manifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, KEY, 'false');
  return manifest;
}

const withAndroidDevMenuNoFab = (config) =>
  withAndroidManifest(config, (c) => {
    c.modResults = hideFab(c.modResults);
    return c;
  });

module.exports = withAndroidDevMenuNoFab;
module.exports.hideFab = hideFab;

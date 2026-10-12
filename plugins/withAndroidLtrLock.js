/**
 * Config plugin: android:supportsRtl="false" on the <application> tag.
 *
 * The app is layout-LTR-locked and hand-flips its own direction for Hebrew
 * (see src/app/_layout.tsx). I18nManager.forceRTL(false)/allowRTL(false) are
 * JS calls that Android persists but only applies on the NEXT start, so on a
 * Hebrew-locale phone the first launch would render RTL. Declaring
 * supportsRtl="false" in the manifest makes Android lay the app out LTR from
 * the very first frame. Android only: no iOS mod is registered.
 *
 * No installed plugin offers this (expo-localization, which has a supportsRTL
 * option, is not a dependency and would add a native module for one attribute).
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

function lockLtr(manifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  application.$['android:supportsRtl'] = 'false';
  return manifest;
}

const withAndroidLtrLock = (config) =>
  withAndroidManifest(config, (c) => {
    c.modResults = lockLtr(c.modResults);
    return c;
  });

module.exports = withAndroidLtrLock;
module.exports.lockLtr = lockLtr;

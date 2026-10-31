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
 * Libraries can declare supportsRtl="true" in their own manifests (TAndroidLame, via
 * react-native-compressor), which fails the Gradle manifest merge; tools:replace makes
 * this value win. Prebuild does not run the merge, so only a Gradle build shows it.
 *
 * No installed plugin offers this (expo-localization, which has a supportsRTL
 * option, is not a dependency and would add a native module for one attribute).
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const TOOLS_NS = 'http://schemas.android.com/tools';

function lockLtr(manifest) {
  // The manifest root must declare xmlns:tools for tools:replace to be valid.
  manifest.manifest.$ ??= {};
  manifest.manifest.$['xmlns:tools'] ??= TOOLS_NS;

  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  application.$['android:supportsRtl'] = 'false';

  // A library (react-native-compressor -> TAndroidLame) declares supportsRtl="true";
  // the manifest merger fails unless we say ours wins. Merged into any existing
  // tools:replace list rather than overwriting it.
  const replace = new Set(
    (application.$['tools:replace'] ?? '').split(',').map((x) => x.trim()).filter(Boolean),
  );
  replace.add('android:supportsRtl');
  application.$['tools:replace'] = [...replace].join(',');
  return manifest;
}

const withAndroidLtrLock = (config) =>
  withAndroidManifest(config, (c) => {
    c.modResults = lockLtr(c.modResults);
    return c;
  });

module.exports = withAndroidLtrLock;
module.exports.lockLtr = lockLtr;

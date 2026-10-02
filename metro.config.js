const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;

// Local env / secret files are never app source. On 2026-10-02 a stray
// `.env.test-logins.local` in the project root was pulled into the DEV bundle
// and broke iOS and web (SyntaxError at 1:0). Keep Expo's defaults; add .env*.
// EXPO_PUBLIC_* values still work: the Expo CLI reads .env itself and inlines
// them at bundle time — Metro never needs to see the file.
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : [defaultBlockList]),
  /[\\/]\.env(\..*)?$/,
];

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  tslib: require.resolve('tslib'),
};

const lucideCjs = path.resolve(__dirname, 'node_modules/lucide-react-native/dist/cjs/lucide-react-native.js');

const defaultResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'lucide-react-native') {
    return { filePath: lucideCjs, type: 'sourceFile' };
  }
  if (defaultResolver) return defaultResolver(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

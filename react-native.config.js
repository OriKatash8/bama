/**
 * Google Sign-In is off for the v1 launch (GOOGLE_SIGNIN_ENABLED in
 * src/core/constants/auth.ts). The JS package stays installed so the code still
 * resolves, but its native module is NOT linked into the iOS/Android build.
 * It links through two systems: this file covers the React Native CLI side;
 * "expo.autolinking.exclude" in package.json covers its Expo module adapter.
 * Re-enabling: see src/core/constants/auth.ts.
 */
module.exports = {
  dependencies: {
    '@react-native-google-signin/google-signin': {
      platforms: { ios: null, android: null },
    },
  },
};

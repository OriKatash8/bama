/**
 * Google Sign-In is off for the v1 App Store launch; it returns later together
 * with Sign in with Apple's consent flow already in place. To turn it back on:
 *   1. set this to true,
 *   2. remove it from "expo.autolinking.exclude" in package.json and delete its
 *      entry in react-native.config.js (the package links through both),
 *   3. restore the "@react-native-google-signin/google-signin" plugin in app.json
 *      (iosUrlScheme: com.googleusercontent.apps.165833515213-ukgt1joohvdo27n9lt9cr5anmediqq6r),
 *   4. rebuild the native app (prebuild --clean / EAS).
 */
export const GOOGLE_SIGNIN_ENABLED = false;

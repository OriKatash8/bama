/**
 * Google Sign-In is on: iOS, Android and web. Apple stays iOS-only.
 * Native clients: iOS = the CLIENT_ID in GoogleService-Info.plist (its reversed
 * form is the iosUrlScheme in app.json); Android is found by package + SHA-1;
 * the web client is passed from useGoogleSignIn.ts. A NEW account still goes
 * through the consent screen (or the register boxes) before anything is written.
 */
export const GOOGLE_SIGNIN_ENABLED = true;

Google Sign-In off for v1 + social consent screen + re-accept gate
Date: 2026-09-28. Status: implemented, NOT committed (waiting for your manual test).

RESULTS
- Typecheck: app clean, functions clean.
- Tests: 231 suites, 2148 tests, all pass.
- New tests: 43, in 8 files (listed below). Three key guarantees were broken on
  purpose (the divider guard, "both boxes required", the "new account goes to
  consent" branch). The tests caught each one; all three were restored.
- Lint: no new errors. The 1 error in RegisterForm.tsx and the 5 in
  ModeSwitcherSheet.tsx were there before this change.


BEFORE YOU SHIP: READ THESE FIRST

1. The Terms and Privacy links are still placeholders.
   src/core/constants/legal.ts has TERMS_URL = https://example.com/terms and
   PRIVACY_URL = https://example.com/privacy. The consent screen (and register)
   link there. App Review will open them. Put the real URLs in before submitting.

2. 39 of 40 existing accounts will hit the consent screen on their next launch.
   Only 1 account (a Google one) has termsVersion stored. Consent was almost never
   actually persisted, because of the sign-up race described in the onUserCreate
   comment. The full list of who is affected was shown in chat on 2026-09-28. It
   covers every provider, including the disabled bama-system account, which never
   signs in. This is what you asked for. Just expect every tester to see it once.

3. Deploy the new function before the app build that relies on it:
     firebase deploy --only functions:discardUnconsentedSignup
   Without it, declining still deletes the Auth user (client-side fallback), but
   the users/{uid} doc that onUserCreate wrote stays behind as an orphan.

4. The native build must be regenerated (npx expo prebuild --clean, or EAS
   build). Only then does the Google pod and URL scheme actually leave the binary.
   ios/ is gitignored and generated.

5. The 6 Google-only accounts can no longer sign in with Google. Email
   enumeration protection is ON, and I have NOT confirmed that password reset
   reaches a Google-only account under it. Test with a spare Google account while
   the old build still has the button, or email those 6 users.

6. Existing data: users/ has 51 docs for 40 Auth users, so 11 orphan docs already
   exist. Not touched here. Worth a separate cleanup.


WHAT CHANGED

Google hidden (reversible)
- src/core/constants/auth.ts: GOOGLE_SIGNIN_ENABLED = false, plus the 4 steps
  to turn it back on.
- LoginForm / RegisterForm: the Google button renders only if the flag is on.
  The "or" divider and the social row render only when a button will show:
  Apple on iOS, Google when the flag is on. So on Android and web there is no
  divider and no empty row. The row still mirrors in Hebrew.
- useGoogleSignIn.ts: the native module is require()d and configured on first
  use, no longer at import. Importing it when its native code is not linked
  would crash at launch.
- app.json: removed the @react-native-google-signin/google-signin plugin, which
  added the iOS URL scheme.
- react-native.config.js (new): turns off React Native CLI linking for the
  package.
- package.json: "expo.autolinking.exclude" covers the package's Expo module
  adapter (ExpoAdapterGoogleSignIn, an AppDelegate subscriber). The package links
  through BOTH systems. Verified with expo-modules-autolinking: google is no
  longer resolved, and expo-apple-authentication still is.
- Kept: the JS package, the button and hook files, the logo, the i18n strings,
  googleProvider, GoogleService-Info.plist (needed by react-native-firebase /
  App Check), and the Google-user exemptions in the gates.

Consent for new social accounts (Apple now; Google if re-enabled)
- useAppleSignIn / useGoogleSignIn: after sign-in they check Firebase's
  getAdditionalUserInfo(result).isNewUser. They do NOT check whether
  users/{uid} exists, because onUserCreate races the client.
    new      -> hold the provider info (Apple sends the name only once) in
                pendingSignupStore, then go to /(auth)/consent. Nothing is written.
    existing -> syncUser WITHOUT terms (no consent is written for them), then
                mode-select, as before.
- Register screen: its checkboxes no longer gate the social buttons, because the
  consent screen does that now. They still gate email/password sign-up, which
  writes its consent exactly as before.
- src/app/(auth)/consent.tsx + ConsentForm.tsx: a terms/privacy checkbox with
  both links, and an 18+ checkbox. Both start unchecked. Continue is disabled
  until both are checked.
    Continue -> setDoc(users/{uid}, {termsAcceptedAt, termsVersion, ageConfirmed:
                true, ageConfirmedAt}, {merge: true}). For a new account it then
                writes the profile (syncUser with the held info). Then goes to "/".
    Cancel   -> calls discardUnconsentedSignup, then signs out and goes to
                /(auth). If the server is unreachable and the account is known to
                be new, deleteUser() is called from the client.
- functions/src/account/discardSignup.ts (new callable, exported): deletes
  users/{uid}, its private/ and profile/ subdocuments, its pushTokens, then the
  Auth user. It only does this for the caller's own account, if the account was
  created within the last hour AND has no termsAcceptedAt/termsVersion. For
  anyone else it returns {discarded:false} and touches nothing, so for existing
  users declining just signs them out. Real account deletion is still
  deleteMyAccount, which tombstones.

Re-accept gate
- legal.ts: CURRENT_TERMS_VERSION = '1.0' (TERMS_VERSION kept as an alias).
  compareTermsVersions and isTermsVersionCurrent compare dotted versions
  numerically, so 1.10 > 1.9.
- needsConsent(user) (pure, in utils/needsConsent.ts): true when termsVersion is
  missing, unreadable, or lower than CURRENT_TERMS_VERSION.
- It is checked in 3 places, before everything else:
    - src/app/index.tsx (the root redirect),
    - useOnboardingGate, as rung 0 ahead of email and phone (it covers both
      group layouts),
    - mode-select, which sign-in lands on outside the layouts.
- To force re-acceptance when the lawyer's version ships: bump
  CURRENT_TERMS_VERSION.

Other
- Checkbox gained optional rtl (box on the right in Hebrew) and testID props.
  Register's checkboxes now use rtl.
- i18n: auth.consent_title, consent_body, consent_continue, consent_decline,
  consent_failed, in en and he.
- 3 existing test files: their fixture users got termsVersion '1.0', so they keep
  testing the email/phone rungs they were written for.

New tests
- src/core/constants/__tests__/termsVersion.test.ts: version comparison.
- src/features/auth/utils/__tests__/needsConsent.test.ts: missing, older,
  current, and a bumped version trigger the gate.
- src/features/auth/hooks/__tests__/consentGate.test.tsx: the gate and the root
  send outdated users to consent, before email and phone.
- src/features/auth/hooks/__tests__/socialConsent.test.tsx: a new Apple user
  sees the consent screen with nothing written; an existing one signs in with no
  consent write.
- src/features/auth/components/__tests__/ConsentForm.test.tsx: both boxes start
  unchecked, with the links; one box is not enough; accept writes exactly the 4
  fields; re-accept by an existing user; decline removes the account and writes
  nothing; the offline fallback deletes the Auth user; an existing user who
  declines is only signed out; Hebrew RTL.
- src/features/auth/components/__tests__/socialButtonsHidden.test.tsx: login and
  register show no Google button; on iOS the divider and Apple only; on Android
  and web no divider and no empty row; Hebrew mirroring; flipping the flag brings
  Google back.
- functions/src/account/__tests__/discardSignup.test.ts: which accounts may be
  discarded (new and unconsented only; never old, consented, or of unknown age).


MANUAL TEST LIST

Setup: deploy discardUnconsentedSignup first, and put the real TERMS/PRIVACY
URLs in if you have them. iPhone: build a fresh dev client (prebuild --clean,
then run on the device), because the native plugin changed.

Web (browser)
[ ] W1 Login screen, English: no Google button, no "or" divider, no empty gap
       under "Don't have an account? Register".
[ ] W2 Same in Hebrew (switch the language in the gear menu): same result, text
       aligned right.
[ ] W3 Register screen, English and Hebrew: no Google button, no divider, no gap
       under Create Account. In Hebrew the checkboxes sit on the right.
[ ] W4 Register a new email/password account (both boxes checked). After
       verification: NO consent screen, straight to mode select, because consent
       was written at register.
[ ] W5 Sign in as an existing account with no termsVersion (almost all of them):
       the consent screen appears first. Both boxes unchecked; Continue disabled;
       the Terms and Privacy links open.
[ ] W6 Check only one box: Continue stays disabled.
[ ] W7 Check both, then Continue: you land in the app. Firebase console:
       users/{uid} now has termsAcceptedAt, termsVersion "1.0", ageConfirmed true,
       and ageConfirmedAt.
[ ] W8 Sign out and in again with that account: no consent screen this time.
[ ] W9 With another old account, press Cancel on the consent screen: you are
       signed out and back on login. The account is NOT deleted (Auth user and
       users doc still there).
[ ] W10 Bump CURRENT_TERMS_VERSION to "1.1" locally and reload: the account from
       W7 sees the consent screen again. Revert afterwards.

iPhone (dev build)
[ ] I1 Login, English: the "or" divider with ONLY the Apple button under it, full
       width, no gap where Google was.
[ ] I2 Login, Hebrew: the same, mirrored.
[ ] I3 Register, English and Hebrew: the divider and Apple only. Checkboxes on
       the right in Hebrew.
[ ] I4 Apple with a NEW Apple ID, from the LOGIN screen: the consent screen
       appears before anything else. No users/{uid} consent fields exist yet in
       the console.
[ ] I5 On that screen, press Cancel: signed out, back on login. Console: the Auth
       user is gone, users/{uid} is gone, and no pushTokens doc exists for it.
[ ] I6 Repeat I4 from the REGISTER screen WITHOUT touching its checkboxes: the
       Apple button is no longer blocked by them, and the consent screen appears.
[ ] I7 Check both, then Continue: you land on mode select. Console: the 4 consent
       fields are set, and displayName is your Apple name (it is kept from the
       first sign-in even though Apple only sends it once).
[ ] I8 Kill the app and reopen it: no consent screen.
[ ] I9 An EXISTING Apple account with no termsVersion: the consent screen appears.
       Cancel only signs out (the account is still there). Continue lets you in.
[ ] I10 Kill the app ON the consent screen during a new Apple sign-up (I4), then
       reopen: the consent screen appears again (the gate catches it). Cancel now
       removes the account, because it is under an hour old.
[ ] I11 Airplane mode on the consent screen for a new account, then Cancel: you
       are signed out, and the Auth user is deleted from the phone. The users doc
       may remain; that is expected offline.
[ ] I12 The app starts normally, with no crash at launch. That confirms the Google
       native module is gone and nothing imports it at load.


TO RE-ENABLE GOOGLE LATER
Follow the 4 steps in src/core/constants/auth.ts: the flag, package.json
exclude plus react-native.config.js, the app.json plugin, then rebuild. The
consent flow already covers Google: a new Google account gets the same consent
screen.

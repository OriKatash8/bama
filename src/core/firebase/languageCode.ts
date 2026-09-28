/**
 * The app's language as Firebase Auth's email templates know it. Firebase lists
 * Hebrew under the legacy code 'iw' (it is also the project's template locale),
 * so 'he' is sent as 'iw'; anything else passes through as-is. No language
 * means the app's default, Hebrew.
 */
export function firebaseLanguageCode(lng: string | undefined): string {
  const code = lng || 'he';
  return code === 'he' ? 'iw' : code;
}

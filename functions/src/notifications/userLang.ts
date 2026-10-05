import { db } from '../lifecycle/helpers';

/**
 * The language to write a user's push in. The app's language lives on the device,
 * not on the server, so today `users/{uid}.language` does not exist and this is
 * always Hebrew (the app's default); the day the app starts writing it, every
 * caller of this picks it up. Same rule lifecycle/feeOverdue.ts has used.
 */
export async function userLang(userId: string): Promise<'he' | 'en'> {
  try {
    return (await db.doc(`users/${userId}`).get()).get('language') === 'en' ? 'en' : 'he';
  } catch {
    return 'he';
  }
}

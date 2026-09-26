import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  onIdTokenChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  sendEmailVerification,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from './config';
import i18n from '@core/i18n';

export async function signUp(email: string, password: string): Promise<FirebaseUser> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signIn(email: string, password: string): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  await firebaseSendPasswordResetEmail(auth, email);
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * The verification email, in the app's language. Separate from signUp so a failed
 * send can never fail the sign-up itself — the verify screen resends.
 */
export async function sendVerificationEmail(user: FirebaseUser): Promise<void> {
  auth.languageCode = i18n.language || 'he';
  await sendEmailVerification(user);
}

/**
 * Fires on sign-in, sign-out AND every token refresh — which is how a user who
 * has just verified their email is noticed: reload() + getIdToken(true) refresh
 * the token without changing the auth state.
 */
export function onTokenChange(callback: (user: FirebaseUser | null) => void): () => void {
  return onIdTokenChanged(auth, callback);
}

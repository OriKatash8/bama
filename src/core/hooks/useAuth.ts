import { useEffect } from 'react';
import { Platform } from 'react-native';
import { deleteField, serverTimestamp } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@core/stores/authStore';
import { useModerationStore } from '@core/stores/moderationStore';
import { onAuthChange, onTokenChange, signOut } from '@core/firebase/auth';
import { needsEmailVerification } from '@features/auth/utils/emailVerification';
import { getDocument, updateDocument, setDocument } from '@core/firebase/firestore';
import { registerIfGranted } from '@core/notifications/registerForPushNotifications';
import { handleForegroundNotification } from '@core/notifications/foregroundHandler';
import i18n from '@core/i18n';
import type { User } from '@core/types/user';

type LegacyUserDoc = User & { role?: string };

// Shows every push while the app is open, except messages in the chat on screen.
Notifications.setNotificationHandler({ handleNotification: handleForegroundNotification });

export function useAuth() {
  const { user, activeMode, isLoading, setUser, setLoading, clear } = useAuthStore();

  // The email-verification gate follows the ID token, not the auth state:
  // verifying and pressing "check again" refreshes the token (reload +
  // getIdToken(true)) without any auth-state change.
  useEffect(() => onTokenChange((firebaseUser) => {
    useAuthStore.getState().setNeedsEmailVerification(needsEmailVerification(firebaseUser));
  }), []);

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (!firebaseUser) {
        clear();
        return;
      }
      console.log('[useAuth] firebaseUser received at', Date.now(), 'uid:', firebaseUser.uid);
      setLoading(true);
      try {
        console.log('[useAuth] calling getDocument at', Date.now());
        const userData = await getDocument<LegacyUserDoc>(`users/${firebaseUser.uid}`);
        if (userData) {
          // Enforcement: a suspended user is signed out immediately and shown
          // the (appealable) reason; a warned user is let in but sees a notice.
          const moderation = userData.moderation;
          if (moderation?.status === 'suspended') {
            useModerationStore.getState().setNotice({ status: 'suspended', reason: moderation.reason });
            await signOut();
            return;
          }
          if ('role' in userData) {
            void updateDocument(`users/${firebaseUser.uid}`, { role: deleteField() } as any);
          }
          // `email` comes from Auth, not the document — see User.email. A doc
          // written before the field was removed may still carry one; dropping
          // it here keeps a stale value from outliving the backfill.
          const { role: _role, email: _staleEmail, ...cleanUser } = userData as any;
          setUser({ ...cleanUser, email: firebaseUser.email ?? undefined } as User);
          setLoading(false);
          if (moderation?.status === 'warned') {
            useModerationStore.getState().setNotice({ status: 'warned', reason: moderation.reason });
          }

          // Fire-and-forget: claim this device's push token for the current
          // user. UNCONDITIONAL — the token string is identical across users on
          // one device, so a conditional write would leave the previous user's
          // id on the doc and old notifications would keep arriving. Never
          // blocks sign-in; no-ops on web/simulator (token is null).
          //
          // registerIfGranted, NOT registerForPushNotifications: the latter
          // REQUESTS permission as a side effect, which put the iOS dialog here —
          // on login and every cold launch, before the user had any reason to say
          // yes. iOS shows that dialog once ever, so a decline here was permanent.
          // Asking now happens at a moment of intent; this path only claims a
          // token for users who already granted.
          void (async () => {
            const token = await registerIfGranted();
            console.log('[push] registerIfGranted returned:', token);
            if (!token) return;
            try {
              await setDocument(`pushTokens/${token}`, {
                userId: firebaseUser.uid,
                platform: Platform.OS,
                language: i18n.language,
                updatedAt: serverTimestamp(),
              });
              // Retire the legacy per-user field so it can't shadow the new source.
              await updateDocument(`users/${firebaseUser.uid}`, {
                expoPushToken: deleteField(),
                pushTokenUpdatedAt: deleteField(),
              } as any);
              console.log('[push] token claimed for user', firebaseUser.uid);
            } catch (e) {
              console.log('[push] token claim failed:', e);
            }
          })();
        } else {
          setLoading(false);
        }
      } catch (e: any) {
        console.error('[useAuth] getDocument failed at', Date.now());
        console.error('[useAuth] error.code:', e?.code);
        console.error('[useAuth] error.message:', e?.message);
        console.error('[useAuth] full error:', e);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  return { user, activeMode, isLoading };
}

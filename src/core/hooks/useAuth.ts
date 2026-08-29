import { useEffect } from 'react';
import { Platform } from 'react-native';
import { deleteField, serverTimestamp } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@core/stores/authStore';
import { onAuthChange } from '@core/firebase/auth';
import { getDocument, updateDocument, setDocument } from '@core/firebase/firestore';
import { registerForPushNotifications } from '@core/notifications/registerForPushNotifications';
import i18n from '@core/i18n';
import type { User } from '@core/types/user';

type LegacyUserDoc = User & { role?: string };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function useAuth() {
  const { user, activeMode, isLoading, setUser, setLoading, clear } = useAuthStore();

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
          if ('role' in userData) {
            void updateDocument(`users/${firebaseUser.uid}`, { role: deleteField() } as any);
          }
          const { role: _role, ...cleanUser } = userData as any;
          setUser(cleanUser as User);
          setLoading(false);

          // Fire-and-forget: claim this device's push token for the current
          // user. UNCONDITIONAL — the token string is identical across users on
          // one device, so a conditional write would leave the previous user's
          // id on the doc and old notifications would keep arriving. Never
          // blocks sign-in; no-ops on web/simulator (token is null).
          void (async () => {
            const token = await registerForPushNotifications();
            console.log('[push] registerForPushNotifications returned:', token);
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

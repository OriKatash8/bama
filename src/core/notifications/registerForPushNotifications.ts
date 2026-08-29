import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { deleteField, serverTimestamp } from 'firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { setDocument, updateDocument } from '@core/firebase/firestore';
import i18n from '@core/i18n';

// Last obtained Expo push token for this device, cached so logout can delete
// the matching pushTokens/{token} doc without re-deriving it. Null on
// web/simulator/permission-denied.
let cachedPushToken: string | null = null;
export function getCachedPushToken(): string | null {
  return cachedPushToken;
}

export type NotifPermissionState = {
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
  granted: boolean;
};

/** Current OS permission state, for display. No-ops safely on web/simulator. */
export async function getNotificationPermissionState(): Promise<NotifPermissionState> {
  try {
    const perms = await Notifications.getPermissionsAsync();
    const status = (perms.status as NotifPermissionState['status']) ?? 'undetermined';
    return { status, canAskAgain: perms.canAskAgain ?? false, granted: status === 'granted' };
  } catch {
    return { status: 'undetermined', canAskAgain: false, granted: false };
  }
}

/**
 * Prompts for permission and, on grant, runs registration so the token lands
 * in pushTokens/{token} for the current user (mirrors the login claim). Safe
 * no-op on web/simulator (registration returns null → nothing written).
 */
export async function requestNotificationPermission(): Promise<NotifPermissionState> {
  try {
    const res = await Notifications.requestPermissionsAsync();
    const status = (res.status as NotifPermissionState['status']) ?? 'undetermined';
    const state: NotifPermissionState = { status, canAskAgain: res.canAskAgain ?? false, granted: status === 'granted' };
    if (state.granted) {
      const token = await registerForPushNotifications();
      const userId = useAuthStore.getState().user?.id;
      if (token && userId) {
        await setDocument(`pushTokens/${token}`, {
          userId,
          platform: Platform.OS,
          language: i18n.language,
          updatedAt: serverTimestamp(),
        });
        await updateDocument(`users/${userId}`, {
          expoPushToken: deleteField(),
          pushTokenUpdatedAt: deleteField(),
        } as never);
      }
    }
    return state;
  } catch {
    return { status: 'undetermined', canAskAgain: false, granted: false };
  }
}

export async function registerForPushNotifications(): Promise<string | null> {
  console.log('[push] isDevice:', Device.isDevice);
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  const finalStatus =
    existing === 'granted'
      ? existing
      : (await Notifications.requestPermissionsAsync()).status;

  console.log('[push] permission status:', finalStatus);
  if (finalStatus !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  console.log('[push] projectId:', projectId);
  if (!projectId) return null;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[push] got token:', token);
    cachedPushToken = token;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#208AEF',
      });
    }

    return token;
  } catch (e) {
    console.log('[push] token error:', e);
    return null;
  }
}

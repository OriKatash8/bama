import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
import { useNotifPromptStore, isPromptSnoozed } from '@core/stores/notifPromptStore';
import {
  getNotificationPermissionState,
  type NotifPermissionState,
} from '@core/notifications/registerForPushNotifications';

/**
 * Whether to show the "notifications are off" banner, and how to dismiss it.
 *
 * One predicate shared by every surface, so the chat list and the dashboard cannot
 * drift apart on when the banner appears or how long a dismissal lasts.
 *
 * Permission is re-read on FOCUS, not once on mount: the whole point of the banner
 * is to send the user to system Settings, and they come back to this screen. Without
 * the refresh the banner would still be sitting there after they granted.
 */
export function useNotifPermissionPrompt(): {
  denied: boolean;
  visible: boolean;
  dismiss: () => void;
} {
  const [perm, setPerm] = useState<NotifPermissionState | null>(null);
  const userId = useAuthStore((s) => s.user?.id);
  const dismissedUntil = useNotifPromptStore((s) => s.dismissedUntil);
  const dismissInStore = useNotifPromptStore((s) => s.dismiss);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getNotificationPermissionState().then((s) => { if (active) setPerm(s); });
      return () => { active = false; };
    }, []),
  );

  const denied = perm?.status === 'denied';
  const visible = denied && !isPromptSnoozed(dismissedUntil, userId);

  const dismiss = useCallback(() => {
    if (userId) dismissInStore(userId);
  }, [userId, dismissInStore]);

  return { denied, visible, dismiss };
}

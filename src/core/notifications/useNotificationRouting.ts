import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
import { useSwitchMode } from '@features/auth/hooks/useSwitchMode';
import type { ActiveMode } from '@core/types/user';

type NotifData = {
  type?: string;
  chatId?: string;
  projectId?: string;
  listingId?: string;
  offerId?: string;
};

function modeSegment(mode: ActiveMode): '(client)' | '(professional)' {
  return mode === 'client' ? '(client)' : '(professional)';
}

/**
 * Deep-links notification taps into the app, auto-switching mode when the
 * target lives in the other mode. Mount once at the app root.
 *
 * Caveats handled:
 *  - useLastNotificationResponse() returns the SAME response object
 *    persistently, so we dedupe on the notification identifier.
 *  - Navigating before auth resolves would bounce to /(auth); we gate on
 *    isLoading/user/activeMode and let the persistent response re-fire once
 *    they resolve (cold-start / launched-from-killed path).
 *  - switchMode() does its own router.replace; we defer the follow-up push
 *    to the next tick so it isn't swallowed by that replace.
 *  - Web has no notifications: useLastNotificationResponse() returns null → no-op.
 */
export function useNotificationRouting(): void {
  const response = Notifications.useLastNotificationResponse();
  const router = useRouter();
  const { switchMode } = useSwitchMode();
  const user = useAuthStore((s) => s.user);
  const activeMode = useAuthStore((s) => s.activeMode);
  const isLoading = useAuthStore((s) => s.isLoading);
  const handledIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!response) return;
    // Gate on auth — do NOT drop; the response persists and this effect
    // re-runs once these resolve (cold start).
    if (isLoading || !user || !activeMode) return;

    const id = response.notification.request.identifier;
    if (handledIdRef.current === id) return; // already handled this response
    handledIdRef.current = id;

    const data = (response.notification.request.content.data ?? {}) as NotifData;
    void route(data, activeMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response, isLoading, user, activeMode]);

  async function route(data: NotifData, current: ActiveMode): Promise<void> {
    const navigate = async (target: ActiveMode | null, href: string) => {
      if (target && target !== current) {
        await switchMode(target); // async; performs its own router.replace
        // Defer past switchMode's replace so our push isn't swallowed.
        setTimeout(() => router.push(href as never), 0);
      } else {
        router.push(href as never);
      }
    };

    switch (data.type) {
      case 'message':
      case 'mission':
      case 'meeting': {
        if (!data.chatId) return;
        await navigate(null, `/${modeSegment(current)}/(tabs)/chats/${data.chatId}`);
        return;
      }
      case 'offer_accepted': {
        await navigate(
          'professional',
          data.chatId
            ? `/(professional)/(tabs)/chats/${data.chatId}`
            : '/(professional)/(tabs)/dashboard',
        );
        return;
      }
      case 'purchase': {
        if (!data.listingId) return;
        await navigate('professional', `/(professional)/(tabs)/marketplace?listingId=${data.listingId}`);
        return;
      }
      case 'offer': {
        await navigate('client', '/(client)/(tabs)/projects');
        return;
      }
      case 'project': {
        // The noticeboard lives on the dashboard tab (no standalone route).
        await navigate('professional', '/(professional)/(tabs)/dashboard');
        return;
      }
      default:
        return; // unknown type or missing ids → no-op
    }
  }
}

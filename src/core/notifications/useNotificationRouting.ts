import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
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
 * Web-safe: every notifications API call is inside an effect that returns early
 * on web BEFORE touching expo-notifications (whose response APIs throw
 * UnavailabilityError on web). We use the imperative listener + initial-response
 * fetch rather than useLastNotificationResponse() (that hook throws on web the
 * instant it's called).
 *
 * Caveats handled:
 *  - Dedupe on the notification identifier (a response can re-fire).
 *  - Auth gate: don't navigate before auth resolves (would bounce to /(auth));
 *    the pending response is queued in state and handled once isLoading/user/
 *    activeMode resolve (cold-start / launched-from-killed path).
 *  - switchMode() does its own router.replace; the follow-up push is deferred a
 *    tick so it isn't swallowed.
 */
export function useNotificationRouting(): void {
  const router = useRouter();
  const { switchMode } = useSwitchMode();
  const user = useAuthStore((s) => s.user);
  const activeMode = useAuthStore((s) => s.activeMode);
  const isLoading = useAuthStore((s) => s.isLoading);
  const handledIdRef = useRef<string | null>(null);
  const [pending, setPending] = useState<Notifications.NotificationResponse | null>(null);

  // Register the tap listener + read the cold-start response. Native only.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    Notifications.getLastNotificationResponseAsync()
      .then((r) => { if (active && r) setPending(r); })
      .catch(() => { /* no notifications available — ignore */ });
    const sub = Notifications.addNotificationResponseReceivedListener((r) => setPending(r));
    return () => { active = false; sub.remove(); };
  }, []);

  // Handle the pending response once auth has resolved (queued, not dropped).
  useEffect(() => {
    if (!pending) return;
    if (isLoading || !user || !activeMode) return;
    const id = pending.notification.request.identifier;
    if (handledIdRef.current === id) return;
    handledIdRef.current = id;
    void route((pending.notification.request.content.data ?? {}) as NotifData, activeMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, isLoading, user, activeMode]);

  async function route(data: NotifData, current: ActiveMode): Promise<void> {
    const navigate = async (target: ActiveMode | null, href: string) => {
      if (target && target !== current) {
        await switchMode(target); // async; performs its own router.replace
        setTimeout(() => router.push(href as never), 0); // defer past that replace
      } else {
        router.push(href as never);
      }
    };

    switch (data.type) {
      case 'message':
      case 'mission':
      case 'meeting':
      // A mention lands in the chat it was written in, same as a message.
      case 'mention':
      case 'system': {
        if (!data.chatId) return;
        await navigate(null, `/${modeSegment(current)}/chat/${data.chatId}`);
        return;
      }
      case 'offer_accepted': {
        await navigate(
          'professional',
          data.chatId
            ? `/(professional)/chat/${data.chatId}`
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
      // ── engagement lifecycle ──
      // Each of these needs a case HERE as well as a writer and a prefs entry.
      // Missing this switch is the failure that looks like success: the push
      // lands, the professional taps it, and nothing happens.
      case 'engagement_completed':
      case 'charge_failed': {
        // Both are the professional's own money. Project details carries the
        // engagement's state and the contest action; the balance screen is where
        // a failed charge is actionable.
        if (data.type === 'charge_failed') {
          await navigate('professional', '/settings/payment');
          return;
        }
        if (data.projectId) {
          await navigate(
            'professional',
            `/(client)/chat/project-details?projectId=${data.projectId}` +
              (data.chatId ? `&chatId=${data.chatId}` : ''),
          );
          return;
        }
        await navigate('professional', '/(professional)/(tabs)/dashboard');
        return;
      }
      case 'end_date_soon': {
        // The CLIENT, and the only thing being asked is "move the date if it is
        // wrong" — which is edited on project details.
        if (data.projectId) {
          await navigate(
            'client',
            `/(client)/chat/project-details?projectId=${data.projectId}` +
              (data.chatId ? `&chatId=${data.chatId}` : ''),
          );
          return;
        }
        await navigate('client', '/(client)/(tabs)/projects');
        return;
      }
      case 'removal': {
        // Land on project-details, where the removal banner and its accept
        // button live — the chat room does not surface the request at all.
        // Falls back to the chat, then the dashboard, if ids are missing.
        if (data.projectId) {
          await navigate(
            'professional',
            `/(client)/chat/project-details?projectId=${data.projectId}` +
              (data.chatId ? `&chatId=${data.chatId}` : ''),
          );
          return;
        }
        await navigate(
          'professional',
          data.chatId
            ? `/(professional)/chat/${data.chatId}`
            : '/(professional)/(tabs)/dashboard',
        );
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

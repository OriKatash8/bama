import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
import { useSwitchMode } from '@features/auth/hooks/useSwitchMode';
import { useLaunchIntentStore } from '@core/stores/launchIntentStore';
import { needsConsent } from '@features/auth/utils/needsConsent';
import { needsProfileSetup } from '@features/auth/utils/needsProfileSetup';
import type { ActiveMode } from '@core/types/user';

type NotifData = {
  type?: string;
  chatId?: string;
  projectId?: string;
  listingId?: string;
  offerId?: string;
};

function readLaunchResponse(): Notifications.NotificationResponse | null {
  if (Platform.OS === 'web') return null;
  try { return Notifications.getLastNotificationResponse(); } catch { return null; }
}

function modeSegment(mode: ActiveMode): '(client)' | '(professional)' {
  return mode === 'client' ? '(client)' : '(professional)';
}

/**
 * Deep-links notification taps into the app, auto-switching mode when the
 * target lives in the other mode. Mount once at the app root.
 *
 * Web-safe: every notifications API call is inside an effect that returns early
 * on web BEFORE touching expo-notifications (whose response APIs throw
 * UnavailabilityError on web). We use the imperative listener + the synchronous
 * launch-response read rather than useLastNotificationResponse() (that hook
 * throws on web the instant it's called).
 *
 * Caveats handled:
 *  - Dedupe on the notification identifier (a response can re-fire, and the
 *    launch tap may also arrive through the listener).
 *  - Auth gate: don't navigate before auth resolves (would bounce to /(auth)),
 *    nor ahead of consent / email verification / setup; the pending response is
 *    queued in state and handled once they resolve. On a relaunch activeMode is
 *    the restored last mode, so a launch tap routes as soon as auth has loaded.
 *  - The launch tap beats the mode's home: launchIntentStore tells the root to
 *    hold off, and the tap lands with ONE replace (Back does not go to a blank
 *    root). A mode switch is switchMode(..., { navigate: false }) — setting and
 *    saving the mode without its own replace, which used to race this one.
 *  - The launch response is cleared once handled, so a later cold start does not
 *    route to the same old notification again.
 */
export function useNotificationRouting(): void {
  const router = useRouter();
  const { switchMode } = useSwitchMode();
  const user = useAuthStore((s) => s.user);
  const activeMode = useAuthStore((s) => s.activeMode);
  const isLoading = useAuthStore((s) => s.isLoading);
  // Consent, email verification and first-time setup come before any target.
  const gated = useAuthStore((s) =>
    needsConsent(s.user) || s.needsEmailVerification !== false || needsProfileSetup(s.user));
  const handledIdRef = useRef<string | null>(null);
  // The tap that launched the app, read once. Synchronous; if it throws, nothing
  // is pending and the root carries on — it never waits on this.
  const [launch] = useState(readLaunchResponse);
  const [pending, setPending] = useState<Notifications.NotificationResponse | null>(launch);

  // Tell the root whether to hold off, and listen for taps. Native only (web
  // starts out checked).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    useLaunchIntentStore.getState().setLaunch(!!launch);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => setPending(r));
    return () => sub.remove();
  }, [launch]);

  /** Returns whether it navigated. */
  async function route(data: NotifData, current: ActiveMode, isLaunch: boolean): Promise<boolean> {
    let went = false;
    const navigate = async (target: ActiveMode | null, href: string) => {
      const switching = !!target && target !== current;
      if (switching) await switchMode(target, { navigate: false });
      // The launch tap replaces the (empty) root; so does a switch into the other
      // mode's stack. A tap while the app is open, same mode, pushes.
      if (isLaunch || switching) router.replace(href as never);
      else router.push(href as never);
      went = true;
    };
    await routeTo(data, current, navigate);
    return went;
  }

  async function routeTo(
    data: NotifData,
    current: ActiveMode,
    navigate: (target: ActiveMode | null, href: string) => Promise<void>,
  ): Promise<void> {

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
            `/(professional)/chat/project-details?projectId=${data.projectId}` +
              (data.chatId ? `&chatId=${data.chatId}` : ''),
          );
          return;
        }
        await navigate('professional', '/(professional)/(tabs)/dashboard');
        return;
      }
      // ── overdue fee ──
      // The professional's own balance, which is where what is owed and how to
      // settle it are listed — the same place a failed charge goes.
      case 'fee_due':
      case 'fee_overdue_soon':
      case 'fee_overdue': {
        await navigate('professional', '/settings/payment');
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
            `/(professional)/chat/project-details?projectId=${data.projectId}` +
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

  // Handle the pending response once auth has resolved (queued, not dropped).
  useEffect(() => {
    if (!pending) return;
    if (isLoading || !user || !activeMode || gated) return;
    const id = pending.notification.request.identifier;
    if (handledIdRef.current === id) return;
    handledIdRef.current = id;
    const isLaunch = id === launch?.notification.request.identifier;
    void (async () => {
      const went = await route((pending.notification.request.content.data ?? {}) as NotifData, activeMode, isLaunch);
      if (!isLaunch) return;
      try { Notifications.clearLastNotificationResponse(); } catch { /* unavailable */ }
      // Release the root. After a navigation, a tick later — by then it is gone,
      // and must not redirect over the target on the way out.
      if (went) setTimeout(() => useLaunchIntentStore.getState().settle(), 0);
      else useLaunchIntentStore.getState().settle();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, isLoading, user, activeMode, gated]);
}

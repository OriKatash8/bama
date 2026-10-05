import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
import { usePendingIntentStore } from '@core/stores/pendingIntentStore';
import { isAllowedDeepLink } from '@core/deepLinks/allowlist';
import { GatePendingScreen, useGatePending } from '@features/auth/components/GatePending';
import { useOnboardingGate } from '@features/auth/hooks/useOnboardingGate';
import { InvitePreviewScreen } from '@features/communities/invites/InvitePreviewScreen';

/**
 * An invite link, bama://c/<token> (or <token-or-code> from the web page).
 *
 * Outside the (client)/(professional) groups, so their gate does not wrap it and
 * this route does its own: signed out, or still owing consent / email / setup, it
 * SAVES the link first and only then redirects, so the sign-in flow can bring the
 * user back here (useSwitchMode and postStepRoute take it). The save happens in an
 * effect and the <Redirect> is not rendered until it has, so no redirect can fire
 * ahead of it.
 *
 * deferPhone: the phone rung belongs to the group layouts. A user without a phone
 * number still sees the invite; they are asked for it when they enter a chat from
 * here. That ordering is intended.
 */
export default function InviteRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const isLoading = useAuthStore((s) => s.isLoading);
  const gatePending = useGatePending();
  const gate = useOnboardingGate({ deferPhone: true });
  const href = `/c/${token ?? ''}`;
  const valid = isAllowedDeepLink(href);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!valid || !gate || saved) return;
    usePendingIntentStore.getState().saveResume(href);
    setSaved(true);
  }, [valid, gate, saved, href]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  // Signed in, email answer not known yet: wait rather than guess (as the group layouts do).
  if (gatePending) return <GatePendingScreen />;
  if (valid && gate) {
    return saved ? <Redirect href={gate as never} /> : <GatePendingScreen />;
  }
  // A malformed token goes to the screen's "not found" state without calling the backend.
  return <InvitePreviewScreen tokenOrCode={valid ? (token as string) : ''} />;
}

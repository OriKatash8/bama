import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuthStore } from '@core/stores/authStore';

/**
 * Signed in, but the email-verification answer has not arrived yet.
 *
 * `needsEmailVerification` is set by the ID-token listener (useAuth), which can
 * report a moment after the user doc has loaded. Until it does, an unverified
 * password account is indistinguishable from a verified one — so the app must
 * not render. The root and both group layouts show GatePendingScreen instead.
 *
 * Only the email rung needs this: it is the one rung whose absence must never
 * be mistaken for a pass. (A phone read that fails stays null and deliberately
 * lets the user in.)
 */
export function useGatePending(): boolean {
  return useAuthStore((s) => !!s.user && s.needsEmailVerification === null);
}

export function GatePendingScreen() {
  return (
    <View testID="gate-pending" style={styles.center}>
      <ActivityIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

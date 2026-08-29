// Web has no push notifications, and expo-notifications'
// useLastNotificationResponse() throws (UnavailabilityError) there. This
// web-only stub — resolved by Metro on web — makes the tap-router a clean
// no-op so mounting it at the app root doesn't crash the web build.
export function useNotificationRouting(): void {}

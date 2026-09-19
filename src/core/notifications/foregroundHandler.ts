import type * as Notifications from 'expo-notifications';
import { isForActiveChat } from '@core/stores/activeChatStore';

/**
 * How a push that arrives while the app is open is presented. Everything is
 * shown, except a new message in the chat the user is already looking at.
 * (With the app in the background the OS shows every push, as before.)
 */
export async function handleForegroundNotification(
  notification: Notifications.Notification,
): Promise<Notifications.NotificationBehavior> {
  const show = !isForActiveChat(notification.request.content.data);
  return {
    shouldShowBanner: show,
    shouldShowList: show,
    shouldPlaySound: show,
    shouldSetBadge: false,
  };
}

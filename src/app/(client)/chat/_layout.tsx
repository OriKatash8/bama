import { Stack } from 'expo-router';

/**
 * The chat flow sits ABOVE the tab navigator, not inside it.
 *
 * It used to live at (tabs)/chats/[chatId], which meant the tabs layout had to
 * erase its own chrome while you were in a chat — `{!inChatRoom && <AppHeader/>}`
 * and `tabBarStyle: { display: 'none' }`, both keyed on the committed pathname.
 * The pathname only changes when the navigation state commits, i.e. when your
 * finger LIFTS. So for the whole edge-swipe back — around half a second — the
 * chat list was being revealed underneath a layout that was still rendering as
 * if you were in a chat: no header, no tab bar. They snapped in afterwards.
 *
 * From here the chat room slides over a fully-formed tabs screen instead, and
 * the swipe reveals it complete. Nothing is hidden, so nothing has to come back.
 */
export default function ChatLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

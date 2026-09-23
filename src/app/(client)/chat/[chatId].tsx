import { useLocalSearchParams } from 'expo-router';
import { ChatRoomScreen } from '@features/chat/screens/ChatRoomScreen';

/**
 * Screen options live in ChatRoomScreen: it is the only place that knows
 * whether the review card is currently swipeable, and the back gesture has to
 * stand down while it is.
 */
export default function ChatRoomRoute() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  return <ChatRoomScreen chatId={chatId} />;
}

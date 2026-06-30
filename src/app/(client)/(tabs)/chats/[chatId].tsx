import { useLocalSearchParams } from 'expo-router';
import { ChatRoomScreen } from '@features/chat/screens/ChatRoomScreen';

export default function ChatRoomRoute() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  return <ChatRoomScreen chatId={chatId} />;
}

import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router';
import { ChatRoomScreen } from '@features/chat/screens/ChatRoomScreen';

export default function ChatRoomRoute() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatRoomScreen chatId={chatId} />
    </>
  );
}

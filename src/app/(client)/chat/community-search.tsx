import { useLocalSearchParams } from 'expo-router';
import { CommunitySearchScreen } from '@features/chat/screens/CommunitySearchScreen';

/**
 * Search inside a community, pushed from community details. Lives beside it
 * (and, like it, in the pro stack too) so it sits on top of the chat room in
 * the viewer's own stack and a result can pop straight back to the room.
 */
export default function CommunitySearchRoute() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  return <CommunitySearchScreen chatId={chatId} />;
}

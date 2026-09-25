import { useLocalSearchParams } from 'expo-router';
import { CommunityAdminScreen } from '@features/communityAdmin/CommunityAdminScreen';

/**
 * The community owner's dashboard. Lives next to community-details (and, like
 * it, is reached by pros through this client-group route). The screen itself
 * sends anyone but the owner back to community-details.
 */
export default function CommunityAdminRoute() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  return <CommunityAdminScreen chatId={chatId ?? ''} />;
}

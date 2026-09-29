import { Dimensions, View } from 'react-native';
import { BottomSheet } from '@components/ui/BottomSheet';
import type { ChatJump } from '@core/stores/chatJumpStore';
import type { SearchKind } from '../hooks/useCommunitySearchIndex';
import { ChatSearchPanel } from './ChatSearchPanel';

/**
 * Search this chat, as a sheet over the room (the header's search icon) rather
 * than a page of its own. A fixed height, so the sheet does not jump as results
 * come and go while typing. A tapped result is handed to the room as a jump;
 * the room closes the sheet and scrolls there (useSearchJump's `jump`).
 *
 * The panel mounts only while open, so the chat's messages are read when
 * searched, not whenever the room opens.
 */
export function ChatSearchSheet({ visible, onClose, chatId, kind, onPick }: {
  visible: boolean;
  onClose: () => void;
  chatId: string;
  kind: SearchKind;
  onPick: (jump: ChatJump) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {visible ? (
        <View style={{ height: Dimensions.get('window').height * 0.75 }}>
          <ChatSearchPanel
            chatId={chatId}
            kind={kind}
            inset={0}
            onPick={(r) => onPick({ chatId, channelId: r.message.channelId, messageId: r.message.id })}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}

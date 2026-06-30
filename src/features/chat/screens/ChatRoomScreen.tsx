import { useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '@core/hooks/useTheme';
import { auth } from '@core/firebase/config';
import { listenToMessages, sendMessage } from '../services/chatService';
import type { Message } from '../types';

interface Props {
  chatId: string;
}

export function ChatRoomScreen({ chatId }: Props) {
  const colors = useTheme();
  const currentUserId = auth.currentUser?.uid ?? '';
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    return listenToMessages(chatId, setMessages);
  }, [chatId]);

  async function handleSend() {
    const text = inputText.trim();
    if (!text || !currentUserId) return;
    setInputText('');
    await sendMessage(chatId, currentUserId, text);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <FlatList
        data={[...messages].reverse()}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isOwn = item.senderId === currentUserId;
          return (
            <View style={[styles.bubbleWrapper, isOwn ? styles.wrapperOwn : styles.wrapperPeer]}>
              <View
                style={[
                  styles.bubble,
                  isOwn ? { backgroundColor: colors.accent } : { backgroundColor: colors.card },
                ]}
              >
                <Text style={[styles.messageText, { color: isOwn ? '#fff' : colors.text }]}>
                  {item.text}
                </Text>
              </View>
            </View>
          );
        }}
      />
      <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text },
          ]}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Message..."
          placeholderTextColor={colors.placeholder}
          multiline
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: colors.accent }]}
          onPress={handleSend}
          disabled={!inputText.trim()}
          activeOpacity={0.7}
        >
          <Text style={styles.sendLabel}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  bubbleWrapper: {
    flexDirection: 'row',
  },
  wrapperOwn: {
    justifyContent: 'flex-end',
  },
  wrapperPeer: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye } from 'lucide-react-native';
import { getDocument } from '@core/firebase/firestore';
import { listenToMessages } from '@features/chat/services/chatService';
import type { Message } from '@features/chat/types';
import {
  AdminPage,
  AdminText,
  Card,
  EmptyState,
  RADIUS,
  SPACE,
  TYPE,
  useAdminPalette,
  useScopedT,
} from '@features/admin/ui';

function fmtTime(seconds?: number): string {
  if (!seconds) return '';
  const d = new Date(seconds * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * A project's group chat, READ-ONLY, for admins (opened from admin/projects).
 *
 * Deliberately not ChatRoomScreen: that screen is a member's — it marks
 * messages read, resets unread counts and sends — and an admin is not a member.
 * This one only listens. The rules let an admin READ project group chats and
 * their messages (never DMs or communities) and never write them.
 */
export default function ProjectChatAdmin() {
  const p = useAdminPalette();
  const { t, rowDir, textAlign } = useScopedT('admin_projects');
  const router = useRouter();
  const { chatId, projectId } = useLocalSearchParams<{ chatId: string; projectId?: string }>();

  const [title, setTitle] = useState('');
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());

  useEffect(() => {
    if (!chatId) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        // Reading the chat first doubles as the access check.
        await getDocument(`chats/${chatId}`);
        if (projectId) {
          const project = await getDocument<{ title?: string }>(`projects/${projectId}`).catch(() => null);
          if (!cancelled) setTitle(project?.title ?? '');
        }
        if (cancelled) return;
        unsub = listenToMessages(chatId, setMessages);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [chatId, projectId]);

  // Sender names, one read per sender.
  useEffect(() => {
    for (const m of messages ?? []) {
      const id = m.senderId;
      if (!id || m.system || id === 'system' || asked.current.has(id)) continue;
      asked.current.add(id);
      void getDocument<{ displayName?: string }>(`users/${id}`)
        .then((u) => setNames((prev) => ({ ...prev, [id]: u?.displayName || t('unknown_sender') })))
        .catch(() => setNames((prev) => ({ ...prev, [id]: t('unknown_sender') })));
    }
  }, [messages, t]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/admin/projects' as never);
  }

  function body(m: Message): string {
    if (m.text) return m.text;
    if (m.imageURL) return t('chat_photo');
    if (m.videoUrl) return t('chat_video');
    if (m.audioUrl) return t('chat_voice');
    if (m.kind === 'project_closed') return t('chat_closed');
    return '';
  }

  return (
    <AdminPage title={title || t('chat_title')} subtitle={t('chat_title')} onBack={goBack}>
      <Card testID="project-chat">
        <View style={[styles.note, { flexDirection: rowDir, backgroundColor: p.surface2 }]}>
          <Eye size={15} color={p.text2} strokeWidth={2.2} />
          <AdminText style={[TYPE.rowMeta, styles.grow, { color: p.text2, textAlign }]}>{t('chat_read_only')}</AdminText>
        </View>

        {failed ? (
          <EmptyState text={t('chat_failed')} testID="chat-failed" />
        ) : messages === null ? (
          <View style={styles.busy}>
            <ActivityIndicator size="small" color={p.accent} testID="chat-loading" />
          </View>
        ) : messages.length === 0 ? (
          <EmptyState text={t('chat_empty')} testID="chat-empty" />
        ) : (
          <View style={styles.list}>
            {messages.map((m) =>
              m.system || m.senderId === 'system' ? (
                <View key={m.id} testID={`msg-${m.id}`} style={[styles.systemPill, { backgroundColor: p.surface2 }]}>
                  <AdminText style={[TYPE.rowMeta, { color: p.text2, textAlign: 'center' }]}>{body(m)}</AdminText>
                </View>
              ) : (
                <View key={m.id} testID={`msg-${m.id}`} style={[styles.bubble, { borderColor: p.border }]}>
                  <View style={[styles.bubbleHead, { flexDirection: rowDir }]}>
                    <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.rowName, styles.grow, { textAlign }]}>
                      {names[m.senderId] ?? ''}
                    </AdminText>
                    <AdminText tabular style={[TYPE.rowMeta, { color: p.text3 }]}>{fmtTime(m.timestamp?.seconds)}</AdminText>
                  </View>
                  <AdminText style={[styles.text, { color: p.text, textAlign }]}>{body(m)}</AdminText>
                </View>
              ),
            )}
          </View>
        )}
      </Card>
    </AdminPage>
  );
}

// lineHeight ≥ 1.47× fontSize: Heebo clips glyph tops below that on iOS.
const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  note: { alignItems: 'center', gap: 8, margin: SPACE.rowPadH, marginBottom: 6, padding: 10, borderRadius: 12 },
  busy: { paddingVertical: 20, alignItems: 'center' },
  list: { gap: 8, paddingHorizontal: SPACE.rowPadH, paddingBottom: SPACE.rowPadH, paddingTop: 6 },
  systemPill: { alignSelf: 'center', borderRadius: RADIUS.pill, paddingVertical: 4, paddingHorizontal: 12, maxWidth: '90%' },
  bubble: { borderWidth: 1, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, gap: 2 },
  bubbleHead: { alignItems: 'center', gap: 8 },
  text: { fontSize: 14, lineHeight: 21 },
});

import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { auth, db } from '@core/firebase/config';
import { uploadFile } from '@core/firebase/storage';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { AppText } from '@components/ui/AppText';
import { confirmDialog } from '@utils/confirmDialog';
import { isGeneralChannel, isMarketChannel, sortChannels, type Channel } from '../communityChannels';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    let result: unknown = translations;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

type Props = {
  visible: boolean;
  onClose: () => void;
  chatId: string;
  chatName: string;
  ownerId: string;
  photoURL?: string | null;
  members: string[];
  /** Display names the caller already has, keyed by uid. Unknown uids show the uid. */
  memberNames: Record<string, string>;
};

/**
 * The community owner's manage panel: pending join requests (approve / reject),
 * members (remove), channels (add / delete), and the community photo.
 *
 * Opened from the community details page. It used to live inside ChatRoomScreen.
 * It reads what it shows itself (requests and channels, only while open), so it
 * doesn't depend on the chat screen being mounted. Channel creation of General and
 * Market stays in ChatRoomScreen, which creates them when the chat is opened.
 *
 * Owner only. The pending-requests query is only provable in the rules for the owner
 * (see the LOAD-BEARING comment on joinRequests in firestore.rules), so nothing here
 * listens unless the signed-in user is the owner.
 */
export function CommunityManageModal({ visible, onClose, chatId, chatName, ownerId, photoURL, members, memberNames }: Props) {
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const currentUserId = auth.currentUser?.uid ?? '';
  const isOwner = !!ownerId && currentUserId === ownerId;

  const [pendingRequests, setPendingRequests] = useState<{ userId: string; displayName: string }[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [addingChannel, setAddingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);

  useEffect(() => {
    if (!visible || !isOwner) return;
    const q = query(collection(db, 'chats', chatId, 'joinRequests'), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => {
      setPendingRequests(snap.docs.map((d) => ({
        userId: d.data().userId as string,
        displayName: d.data().displayName as string,
      })));
    }, (err) => console.error('[CommunityManageModal] join requests listener failed:', err));
  }, [visible, isOwner, chatId]);

  useEffect(() => {
    if (!visible || !isOwner) return;
    const q = query(collection(db, 'chats', chatId, 'channels'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snap) => {
      setChannels(sortChannels(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Channel))));
    }, (err) => console.error('[CommunityManageModal] channels listener failed:', err));
  }, [visible, isOwner, chatId]);

  if (!isOwner) return null;

  async function handleApproveRequest(userId: string) {
    await updateDoc(doc(db, 'chats', chatId, 'joinRequests', userId), { status: 'approved' });
    await updateDoc(doc(db, 'chats', chatId), { members: arrayUnion(userId) });
  }

  async function handleRejectRequest(userId: string) {
    await updateDoc(doc(db, 'chats', chatId, 'joinRequests', userId), { status: 'rejected' });
  }

  async function handleRemoveMember(userId: string) {
    if (userId === ownerId) return;
    await updateDoc(doc(db, 'chats', chatId), { members: arrayRemove(userId) });
  }

  async function handleAddChannel() {
    const name = newChannelName.trim();
    if (!name) return;
    await addDoc(collection(db, 'chats', chatId, 'channels'), {
      name,
      createdAt: serverTimestamp(),
      createdBy: currentUserId,
      lastMessage: null,
    });
    setNewChannelName('');
    setAddingChannel(false);
  }

  async function handleDeleteChannel(channelId: string, channelName: string) {
    const confirmed = await confirmDialog(t('community.delete_channel'), channelName);
    if (!confirmed) return;
    // An open chat's channel listener moves off a deleted active channel by itself.
    await deleteDoc(doc(db, 'chats', chatId, 'channels', channelId));
  }

  async function handleChangePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    setPhotoUploading(true);
    try {
      const blob = await fetch(result.assets[0].uri).then((r) => r.blob());
      const url = await uploadFile(`community-images/${chatId}.jpg`, blob);
      await updateDoc(doc(db, 'chats', chatId), { photoURL: url });
    } finally {
      setPhotoUploading(false);
    }
  }

  const rowDir = rtl ? 'row-reverse' : 'row';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={{ width: '90%', maxHeight: '85%' }}>
          <LinearGradient colors={['#1a237e', '#004aad']} style={styles.modal}>
            <View style={[styles.modalHeader, { flexDirection: rowDir }]}>
              <AppText weight="bold" style={styles.modalTitle}>{t('communities.manage')}</AppText>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="close">
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 22 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Community photo — owner can change it */}
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <TouchableOpacity onPress={handleChangePhoto} activeOpacity={0.8} style={{ position: 'relative' }} testID="manage-photo">
                  {photoURL ? (
                    <Image source={{ uri: photoURL }} style={{ width: 72, height: 72, borderRadius: 16 }} />
                  ) : (
                    <LinearGradient
                      colors={['#1e4fa3', '#cb6ce6']}
                      style={{ width: 72, height: 72, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <AppText weight="bold" style={{ color: '#fff', fontSize: 28 }}>
                        {(chatName || '?').charAt(0).toUpperCase()}
                      </AppText>
                    </LinearGradient>
                  )}
                  {!photoUploading && (
                    <View style={styles.photoBadge}>
                      <Camera size={12} color="#fff" strokeWidth={2} />
                    </View>
                  )}
                  {photoUploading && (
                    <View style={styles.photoUploading}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
                <AppText weight="semiBold" style={{ color: '#fff', marginTop: 8, fontSize: 15 }}>{chatName}</AppText>
              </View>

              {/* Pending requests */}
              <AppText weight="semiBold" style={styles.sectionTitle}>
                {t('communities.pending_requests')} ({pendingRequests.length})
              </AppText>
              {pendingRequests.length === 0 ? (
                <AppText weight="regular" style={styles.emptyText}>—</AppText>
              ) : (
                pendingRequests.map((req) => (
                  <View key={req.userId} style={[styles.requestRow, { flexDirection: rowDir }]} testID={`manage-request-${req.userId}`}>
                    <AppText weight="regular" style={styles.requestName} numberOfLines={1}>{req.displayName}</AppText>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#16a34a' }]} onPress={() => handleApproveRequest(req.userId)}>
                      <AppText weight="semiBold" style={styles.actionBtnText}>{t('communities.approve')}</AppText>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#dc2626' }]} onPress={() => handleRejectRequest(req.userId)}>
                      <AppText weight="semiBold" style={styles.actionBtnText}>{t('communities.reject')}</AppText>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {/* Members */}
              <AppText weight="semiBold" style={[styles.sectionTitle, { marginTop: 20 }]}>
                {t('communities.members')} ({members.length})
              </AppText>
              {members.map((uid) => (
                <View key={uid} style={[styles.memberRow, { flexDirection: rowDir }]}>
                  <View style={styles.memberAvatar}>
                    <AppText weight="bold" style={styles.memberInitial}>{(memberNames[uid] ?? uid).charAt(0).toUpperCase()}</AppText>
                  </View>
                  <AppText weight="regular" style={styles.memberName} numberOfLines={1}>
                    {memberNames[uid] ?? uid}
                    {uid === ownerId ? ' ★' : ''}
                  </AppText>
                  {uid !== ownerId && (
                    <TouchableOpacity onPress={() => handleRemoveMember(uid)} style={{ padding: 4 }} testID={`manage-remove-${uid}`}>
                      <Text style={{ color: '#dc2626', fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {/* Channels */}
              <AppText weight="semiBold" style={[styles.sectionTitle, { marginTop: 20 }]}>
                {t('community.channels')} ({channels.length})
              </AppText>
              {channels.map((ch) => (
                <View key={ch.id} style={[styles.channelRow, { flexDirection: rowDir }]}>
                  <AppText weight="regular" style={styles.channelName}># {ch.name}</AppText>
                  {!isGeneralChannel(ch, t('community.default_channel')) && !isMarketChannel(ch, t('community.market_channel')) && (
                    <TouchableOpacity onPress={() => handleDeleteChannel(ch.id, ch.name)} style={{ padding: 4 }} testID={`manage-delete-channel-${ch.id}`}>
                      <Text style={{ color: '#dc2626', fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {addingChannel ? (
                <View style={[styles.addChannelRow, { flexDirection: rowDir }]}>
                  <TextInput
                    value={newChannelName}
                    onChangeText={setNewChannelName}
                    placeholder={t('community.channel_name')}
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    style={[styles.channelInput, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
                    autoFocus
                    testID="manage-channel-input"
                  />
                  <TouchableOpacity style={styles.addBtn} onPress={handleAddChannel} testID="manage-channel-add">
                    <Text style={[{ color: '#004aad', ...font.bold, fontSize: 15 }]}>+</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setAddingChannel(true)} style={styles.addChannelTrigger}>
                  <AppText weight="semiBold" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                    {t('community.add_channel')}
                  </AppText>
                </TouchableOpacity>
              )}

              <View style={{ height: 16 }} />
            </ScrollView>
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modal: { borderRadius: 24, padding: 24 },
  modalHeader: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  sectionTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 8 },
  requestRow: { alignItems: 'center', gap: 8, marginBottom: 10 },
  requestName: { flex: 1, color: '#fff', fontSize: 14 },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  actionBtnText: { color: '#fff', fontSize: 12 },
  memberRow: { alignItems: 'center', gap: 10, marginBottom: 10 },
  memberAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  memberInitial: { color: '#fff', fontSize: 14 },
  memberName: { flex: 1, color: '#fff', fontSize: 14 },
  channelRow: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  channelName: { color: '#fff', fontSize: 14, flex: 1 },
  addChannelRow: { alignItems: 'center', gap: 8, marginTop: 8 },
  channelInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: '#fff', fontSize: 14 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  addChannelTrigger: { paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 10, marginTop: 8 },
  photoBadge: {
    position: 'absolute', bottom: -4, right: -4, width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
  },
  photoUploading: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
});

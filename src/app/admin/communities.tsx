import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, query, where, orderBy, Timestamp, arrayRemove, getDoc,
} from 'firebase/firestore';
import { ChevronDown, ChevronUp, X, ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { db } from '@core/firebase/config';
import { createCommunityChat } from '@features/chat/services/chatService';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useUiStore } from '@core/stores/uiStore';

type CommunityRequest = {
  id: string;
  name: string;
  description: string;
  requesterId: string;
  requesterName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp | null;
  photoURL?: string;
  category?: string;
};

type Community = {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  members: string[];
  createdAt: Timestamp | null;
  status: 'active' | 'suspended';
};

export default function CommunitiesAdmin() {
  const colors = useTheme();
  const font = useAppFont();
  const router = useRouter();
  const { showToast } = useUiStore();

  const [requests, setRequests] = useState<CommunityRequest[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [expandedMembers, setExpandedMembers] = useState<Record<string, boolean>>({});
  const [newOwnerInput, setNewOwnerInput] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'communityRequests'), where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityRequest)));
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'chats'), where('type', '==', 'community'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, async (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Community));
      setCommunities(list);
      setLoading(false);

      const ownerIds = [...new Set(list.map((c) => c.ownerId))];
      const names: Record<string, string> = {};
      await Promise.all(
        ownerIds.map(async (uid) => {
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists()) {
            names[uid] = (userDoc.data() as { displayName?: string }).displayName ?? uid;
          }
        })
      );
      setOwnerNames((prev) => ({ ...prev, ...names }));
    });
  }, []);

  async function handleApprove(req: CommunityRequest) {
    await createCommunityChat(req.name, req.description, req.requesterId, req.photoURL, req.category);
    await updateDoc(doc(db, 'communityRequests', req.id), { status: 'approved' });
    showToast('Community approved', 'success');
  }

  async function handleReject(id: string) {
    await updateDoc(doc(db, 'communityRequests', id), { status: 'rejected' });
    showToast('Request rejected', 'success');
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete Community', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteDoc(doc(db, 'chats', id));
          showToast('Community deleted', 'success');
        },
      },
    ]);
  }

  async function handleToggleSuspend(c: Community) {
    const next = c.status === 'active' ? 'suspended' : 'active';
    await updateDoc(doc(db, 'chats', c.id), { status: next });
    showToast(`Community ${next}`, 'success');
  }

  async function handleRemoveMember(communityId: string, memberId: string) {
    await updateDoc(doc(db, 'chats', communityId), { members: arrayRemove(memberId) });
    showToast('Member removed', 'success');
  }

  async function handleChangeOwner(communityId: string) {
    const newOwner = newOwnerInput[communityId]?.trim();
    if (!newOwner) return;
    await updateDoc(doc(db, 'chats', communityId), { ownerId: newOwner });
    setNewOwnerInput((prev) => ({ ...prev, [communityId]: '' }));
    showToast('Owner updated', 'success');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.container}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <TouchableOpacity onPress={() => router.push('/admin/operations')} hitSlop={8} activeOpacity={0.7}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={[styles.pageTitle, { ...font.bold, color: colors.text }]}>
          Communities
        </Text>
      </View>

      {/* Pending Requests */}
      <Text style={[styles.sectionTitle, { ...font.semiBold, color: colors.textSec }]}>
        Pending Requests ({requests.length})
      </Text>
      {requests.length === 0 ? (
        <Text style={[styles.empty, { ...font.regular, color: colors.textMuted }]}>No pending requests</Text>
      ) : (
        requests.map((req) => (
          <View key={req.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { ...font.semiBold, color: colors.text }]}>{req.name}</Text>
            <Text style={[styles.cardSub, { ...font.regular, color: colors.textSec }]}>{req.description}</Text>
            <Text style={[styles.cardMeta, { ...font.regular, color: colors.textMuted }]}>
              By {req.requesterName}
            </Text>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#16a34a' }]}
                onPress={() => handleApprove(req)}
              >
                <Text style={[styles.actionBtnText, { ...font.semiBold }]}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#dc2626' }]}
                onPress={() => handleReject(req.id)}
              >
                <Text style={[styles.actionBtnText, { ...font.semiBold }]}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Active Communities */}
      <Text style={[styles.sectionTitle, { ...font.semiBold, color: colors.textSec, marginTop: 24 }]}>
        All Communities ({communities.length})
      </Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : communities.length === 0 ? (
        <Text style={[styles.empty, { ...font.regular, color: colors.textMuted }]}>No communities yet</Text>
      ) : (
        communities.map((c) => (
          <View key={c.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { ...font.semiBold, color: colors.text, flex: 1 }]}>{c.name}</Text>
              <View style={[styles.statusBadge, { backgroundColor: c.status === 'active' ? '#16a34a' : '#f59e0b' }]}>
                <Text style={styles.statusText}>{c.status}</Text>
              </View>
            </View>

            <Text style={[styles.cardMeta, { ...font.regular, color: colors.textMuted }]}>
              Owner: {ownerNames[c.ownerId] ?? c.ownerId} · {c.members.length} members
            </Text>

            {/* Change owner */}
            <View style={styles.ownerRow}>
              <TextInput
                placeholder="New owner UID"
                placeholderTextColor={colors.placeholder}
                value={newOwnerInput[c.id] ?? ''}
                onChangeText={(v) => setNewOwnerInput((prev) => ({ ...prev, [c.id]: v }))}
                style={[styles.ownerInput, { ...font.regular, color: colors.text, borderColor: colors.border }]}
              />
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleChangeOwner(c.id)}
              >
                <Text style={[styles.smallBtnText, { ...font.semiBold }]}>Set</Text>
              </TouchableOpacity>
            </View>

            {/* Members list toggle */}
            <TouchableOpacity
              style={styles.membersToggle}
              onPress={() => setExpandedMembers((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
            >
              <Text style={[styles.membersToggleText, { ...font.regular, color: colors.primary }]}>
                Members
              </Text>
              {expandedMembers[c.id]
                ? <ChevronUp size={16} color={colors.primary} />
                : <ChevronDown size={16} color={colors.primary} />
              }
            </TouchableOpacity>

            {expandedMembers[c.id] && (
              <View style={{ marginTop: 8 }}>
                {c.members.map((uid) => (
                  <View key={uid} style={styles.memberRow}>
                    <Text style={[styles.memberUid, { ...font.regular, color: colors.textSec }]} numberOfLines={1}>
                      {uid}
                    </Text>
                    <TouchableOpacity onPress={() => handleRemoveMember(c.id, uid)}>
                      <X size={16} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={[styles.actionRow, { marginTop: 12 }]}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: c.status === 'active' ? '#f59e0b' : '#16a34a' }]}
                onPress={() => handleToggleSuspend(c)}
              >
                <Text style={[styles.actionBtnText, { ...font.semiBold }]}>
                  {c.status === 'active' ? 'Suspend' : 'Unsuspend'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#dc2626' }]}
                onPress={() => handleDelete(c.id)}
              >
                <Text style={[styles.actionBtnText, { ...font.semiBold }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 60 },
  pageTitle: { fontSize: 26, fontWeight: '700', marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  empty: { fontSize: 14, marginBottom: 16 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, marginBottom: 4 },
  cardMeta: { fontSize: 12, marginBottom: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  actionBtnText: { color: '#fff', fontSize: 13 },
  ownerRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  ownerInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 36, fontSize: 13 },
  smallBtn: { paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center' },
  smallBtnText: { color: '#fff', fontSize: 13 },
  membersToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  membersToggleText: { fontSize: 13 },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  memberUid: { fontSize: 12, flex: 1, marginRight: 8 },
});

import { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  collection, onSnapshot, updateDoc, deleteDoc, doc,
  query, where, orderBy, Timestamp, arrayRemove, getDoc,
} from 'firebase/firestore';
import { ChevronDown, ChevronUp, Search } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { db } from '@core/firebase/config';
import { createCommunityChat } from '@features/chat/services/chatService';
import { useUiStore } from '@core/stores/uiStore';
import { HEEBO ,
  AdminPage,
  AdminText,
  Card,
  CardHead,
  Chip,
  CountBadge,
  EmptyState,
  InitialsAvatar,
  PillButton,
  Row,
  RADIUS,
  SPACE,
  StatGrid,
  StatTile,
  TYPE,
  WhoBlock,
  useAdminPalette,
  useScopedT,
} from '@features/admin/ui';

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

/** This page's strings live in `admin_communities`; the rest reuse existing blocks. */
function usePageT() {
  const own = useScopedT('admin_communities');
  const k = {
    ops: useScopedT('admin_operations').t,
    com: useScopedT('communities').t,
    ca: useScopedT('community_admin').t,
    users: useScopedT('admin_users').t,
    dash: useScopedT('admin_dashboard').t,
    proj: useScopedT('project_details').t,
    common: useScopedT('common').t,
    details: useScopedT('community_details').t,
  };
  return { ...own, tp: own.t, k };
}

/** The pill is the focus affordance; the browser's input outline would sit inside it. */
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

/**
 * Community creation requests and every community: approve / reject requests,
 * suspend, delete, hand over ownership and remove members — in the admin
 * dashboard's design.
 */
export default function CommunitiesAdmin() {
  const p = useAdminPalette();
  const { k, tp, rowDir, textAlign } = usePageT();
  const router = useRouter();
  const { showToast } = useUiStore();

  const [requests, setRequests] = useState<CommunityRequest[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [expandedMembers, setExpandedMembers] = useState<Record<string, boolean>>({});
  const [newOwnerInput, setNewOwnerInput] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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
    showToast(tp('toast_approved'), 'success');
  }

  async function handleReject(req: CommunityRequest) {
    await updateDoc(doc(db, 'communityRequests', req.id), { status: 'rejected' });
    showToast(k.ca('toast_rejected', { name: req.name }), 'success');
  }

  async function handleDelete(id: string) {
    Alert.alert(tp('delete_title'), k.proj('delete_confirm_body'), [
      { text: k.common('cancel'), style: 'cancel' },
      {
        text: k.proj('delete_confirm_ok'), style: 'destructive',
        onPress: async () => {
          await deleteDoc(doc(db, 'chats', id));
          showToast(tp('toast_deleted'), 'success');
        },
      },
    ]);
  }

  async function handleToggleSuspend(c: Community) {
    const next = c.status === 'active' ? 'suspended' : 'active';
    await updateDoc(doc(db, 'chats', c.id), { status: next });
    showToast(tp(next === 'suspended' ? 'toast_suspended' : 'toast_activated'), 'success');
  }

  async function handleRemoveMember(communityId: string, memberId: string) {
    await updateDoc(doc(db, 'chats', communityId), { members: arrayRemove(memberId) });
    showToast(k.ca('toast_removed', { name: memberId }), 'success');
  }

  async function handleChangeOwner(communityId: string) {
    const newOwner = newOwnerInput[communityId]?.trim();
    if (!newOwner) return;
    await updateDoc(doc(db, 'chats', communityId), { ownerId: newOwner });
    setNewOwnerInput((prev) => ({ ...prev, [communityId]: '' }));
    showToast(tp('toast_owner'), 'success');
  }

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/admin/operations');
  }

  // Client-side: by community name, owner name or owner uid.
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? communities.filter((c) =>
        [c.name, ownerNames[c.ownerId] ?? '', c.ownerId].some((s) => (s ?? '').toLowerCase().includes(needle)))
    : communities;

  const suspended = communities.filter((c) => c.status === 'suspended').length;
  const members = communities.reduce((sum, c) => sum + (c.members?.length ?? 0), 0);
  const requestsTitle = tp('requests_title');

  return (
    <AdminPage title={k.ops('communities')} subtitle={tp('subtitle')} onBack={back}>
      {/* Every tile carries a footer line, like the dashboard's. */}
      <StatGrid>
        <StatTile
          testID="tile-requests"
          label={requestsTitle}
          value={requests.length}
          ring={requests.length > 0}
          caption={requests.length > 0 ? k.com('pending') : k.ca('all_clear')}
        />
        <StatTile
          testID="tile-communities"
          label={k.dash('total_communities')}
          value={communities.length}
          loading={loading}
          caption={k.dash('all_time')}
        />
        <StatTile
          testID="tile-suspended"
          label={k.users('status_suspended')}
          value={suspended}
          loading={loading}
          chip={{ text: `${communities.length - suspended} ${k.users('status_active')}`, kind: 'good' }}
        />
        <StatTile
          testID="tile-members"
          label={k.ca('tile_members')}
          value={members}
          loading={loading}
          caption={tp('members_caption')}
        />
      </StatGrid>

      {/* Pending creation requests: lifted with the amber ring while any wait. */}
      <Card priority={requests.length > 0} testID="requests-card">
        <CardHead title={requestsTitle} side={requests.length > 0 ? <CountBadge n={requests.length} testID="requests-count" /> : undefined} />
        {requests.length === 0 ? (
          <EmptyState text={k.ca('empty_requests')} testID="requests-empty" />
        ) : (
          requests.map((req) => (
            <Row key={req.id} rowDir={rowDir} testID={`request-${req.id}`}>
              <InitialsAvatar name={req.name} />
              <View style={styles.text}>
                <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.rowName, { textAlign }]}>
                  {req.name}
                </AdminText>
                {!!req.description && (
                  <AdminText numberOfLines={2} style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>
                    {req.description}
                  </AdminText>
                )}
                <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
                  {`${k.users('by')} ${req.requesterName}`}
                </AdminText>
              </View>
              <View style={[styles.actions, { flexDirection: rowDir }]}>
                <PillButton variant="primary" label={k.com('approve')} onPress={() => handleApprove(req)} testID={`approve-${req.id}`} />
                <PillButton label={k.com('reject')} onPress={() => handleReject(req)} testID={`reject-${req.id}`} />
              </View>
            </Row>
          ))
        )}
      </Card>

      {/* All communities, with MembersCard's search pill. */}
      <Card testID="communities-card">
        <View style={[styles.head, { flexDirection: rowDir }]}>
          <AdminText weight="semiBold" accessibilityRole="header" style={TYPE.cardTitle}>
            {tp('list_title')}
          </AdminText>
          <Chip label={String(communities.length)} tabular />
          <View style={styles.spacer} />
          <View style={[styles.search, { flexDirection: rowDir, backgroundColor: p.surface2, borderColor: p.border }]}>
            <Search size={13} color={p.text3} strokeWidth={2.4} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={k.ca('search')}
              placeholderTextColor={p.text3}
              accessibilityLabel={tp('search_a11y')}
              autoCapitalize="none"
              autoCorrect={false}
              testID="community-search"
              style={[styles.searchInput, webNoOutline, { color: p.text, fontFamily: HEEBO.regular, textAlign }]}
            />
          </View>
        </View>
        <View style={styles.list}>
          {loading ? (
            <View style={[styles.loading, { borderTopColor: p.border }]}>
              <ActivityIndicator color={p.text3} testID="communities-loading" />
            </View>
          ) : communities.length === 0 ? (
            <EmptyState text={k.com('empty')} testID="communities-empty" />
          ) : shown.length === 0 ? (
            <EmptyState text={tp('empty_search')} testID="communities-no-match" />
          ) : (
            shown.map((c) => {
              const open = !!expandedMembers[c.id];
              const Chevron = open ? ChevronUp : ChevronDown;
              const active = c.status === 'active';
              const count = c.members?.length ?? 0;
              return (
                <View key={c.id} testID={`community-${c.id}`} style={[styles.block, { borderTopColor: p.border }]}>
                  <View style={[styles.blockHead, { flexDirection: rowDir }]}>
                    <InitialsAvatar name={c.name} />
                    <WhoBlock
                      name={c.name}
                      meta={`${k.details('owner')}: ${ownerNames[c.ownerId] ?? c.ownerId} · ${k.ca('members_count', { n: count })}`}
                      textAlign={textAlign}
                    />
                    <StatusPill active={active} label={k.users(active ? 'status_active' : 'status_suspended')} testID={`status-${c.id}`} />
                  </View>

                  {/* Change owner */}
                  <View style={[styles.ownerRow, { flexDirection: rowDir }]}>
                    <TextInput
                      placeholder={tp('owner_placeholder')}
                      placeholderTextColor={p.text3}
                      value={newOwnerInput[c.id] ?? ''}
                      onChangeText={(v) => setNewOwnerInput((prev) => ({ ...prev, [c.id]: v }))}
                      autoCapitalize="none"
                      autoCorrect={false}
                      testID={`owner-input-${c.id}`}
                      style={[
                        styles.ownerInput,
                        webNoOutline,
                        { color: p.text, borderColor: p.border, backgroundColor: p.surface2, fontFamily: HEEBO.regular, textAlign },
                      ]}
                    />
                    <PillButton label={tp('set_owner')} onPress={() => handleChangeOwner(c.id)} testID={`owner-set-${c.id}`} />
                  </View>

                  <View style={[styles.controls, { flexDirection: rowDir }]}>
                    <Pressable
                      onPress={() => setExpandedMembers((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      hitSlop={6}
                      testID={`members-toggle-${c.id}`}
                      style={[styles.toggle, { flexDirection: rowDir }]}
                    >
                      <AdminText weight="medium" style={[TYPE.button, { color: p.accent }]}>
                        {k.com('members')}
                      </AdminText>
                      <Chevron size={15} color={p.accent} strokeWidth={2.2} />
                    </Pressable>
                    <View style={styles.spacer} />
                    <PillButton
                      label={k.users(active ? 'suspend' : 'unsuspend')}
                      onPress={() => handleToggleSuspend(c)}
                      testID={`suspend-${c.id}`}
                    />
                    <PillButton variant="danger" label={k.proj('delete_confirm_ok')} onPress={() => handleDelete(c.id)} testID={`delete-${c.id}`} />
                  </View>

                  {open && (
                    <View style={styles.members} testID={`members-${c.id}`}>
                      {(c.members ?? []).map((uid) => (
                        <Row key={uid} rowDir={rowDir} testID={`member-${c.id}-${uid}`}>
                          <InitialsAvatar name={uid} size={30} />
                          <WhoBlock name={uid} meta="" textAlign={textAlign} />
                          <PillButton
                            variant="danger"
                            label={k.ca('remove')}
                            onPress={() => handleRemoveMember(c.id, uid)}
                            testID={`remove-${c.id}-${uid}`}
                          />
                        </Row>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </Card>
    </AdminPage>
  );
}

function StatusPill({ active, label, testID }: { active: boolean; label: string; testID?: string }) {
  const p = useAdminPalette();
  return (
    <View style={[styles.statusPill, { backgroundColor: active ? p.goodBg : p.warnBg }]} testID={testID}>
      <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.chip, { color: active ? p.good : p.warn }]}>
        {label}
      </AdminText>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { flex: 1, minWidth: 0, gap: 1 },
  actions: { gap: 7, flexShrink: 0 },
  head: { alignItems: 'center', gap: 10, paddingTop: 16, paddingHorizontal: SPACE.rowPadH, flexWrap: 'wrap' },
  spacer: { flex: 1 },
  search: {
    alignItems: 'center',
    gap: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  searchInput: { width: 140, fontSize: 12.5, padding: 0 },
  list: { marginTop: 12 },
  loading: { paddingVertical: 26, borderTopWidth: 1, alignItems: 'center' },
  block: { borderTopWidth: 1, paddingTop: SPACE.rowPadV + 2 },
  blockHead: { alignItems: 'center', gap: 12, paddingHorizontal: SPACE.rowPadH },
  statusPill: { borderRadius: RADIUS.pill, paddingVertical: 3, paddingHorizontal: 10, flexShrink: 0 },
  ownerRow: { alignItems: 'center', gap: 8, paddingTop: 12, paddingHorizontal: SPACE.rowPadH },
  ownerInput: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: 14, height: 34, fontSize: 13 },
  controls: { alignItems: 'center', gap: 7, flexWrap: 'wrap', paddingVertical: 12, paddingHorizontal: SPACE.rowPadH },
  toggle: { alignItems: 'center', gap: 4 },
  members: { paddingBottom: 4 },
});

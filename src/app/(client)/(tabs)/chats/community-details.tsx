import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { BellOff, LogOut } from 'lucide-react-native';
import { confirmDialog } from '@utils/confirmDialog';
import { db } from '@core/firebase/config';
import { getDocument } from '@core/firebase/firestore';
import { auth } from '@core/firebase/config';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { AppText } from '@components/ui/AppText';
import { categoryLabel } from '@features/crew/data/categories';
import { CommunityAvatar } from '@features/chat/components/CommunityDiscoveryTab';
import {
  removeMemberFromGroup,
  muteChat,
  unmuteChat,
} from '@features/chat/services/chatService';
import type { Chat } from '@features/chat/types';
import type { User } from '@core/types/user';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    let str = typeof result === 'string' ? result : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{{${k}}}`, v);
      }
    }
    return str;
  };
}

type MemberInfo = Pick<User, 'displayName' | 'photoURL'>;

/**
 * The community counterpart to project-details.
 *
 * Reached by tapping the community name in the chat header. Deliberately mirrors
 * project-details' shell (LinearGradient + bare ScrollView, not the shared Screen
 * component) so the two info pages read as one family.
 */
export default function CommunityDetailsScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const router = useRouter();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const activeMode = useAuthStore((s) => s.activeMode);
  const rtl = language === 'he';
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';
  const t = makeT(rtl ? he : en);
  const rowDir: 'row' | 'row-reverse' = rtl ? 'row-reverse' : 'row';
  const align = rtl ? 'right' : 'left';
  const currentUserId = auth.currentUser?.uid ?? '';

  const [community, setCommunity] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [memberUsers, setMemberUsers] = useState<Record<string, MemberInfo>>({});
  const [muted, setMuted] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Live, not a one-shot read: the member list changes when the owner approves a
  // join request while this page is open, and leaving has to be reflected too.
  useEffect(() => {
    if (!chatId) {
      setIsLoading(false);
      return;
    }
    return onSnapshot(
      doc(db, 'chats', chatId),
      (snap) => {
        setCommunity(snap.exists() ? ({ id: snap.id, ...snap.data() } as Chat) : null);
        setIsLoading(false);
      },
      (err) => {
        console.error('[community-details] chat listener failed:', err);
        setIsLoading(false);
      },
    );
  }, [chatId]);

  // Member profiles, fetched once per uid. User docs are world-readable to signed-in
  // users, so this cannot fail for permission reasons.
  //
  // `attemptedRef` — NOT `memberUsers` — is what marks a uid done. A deleted user
  // resolves to null and would never land in memberUsers, so keying off the state
  // would leave that uid permanently "missing" and refetch it on every snapshot.
  const attemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const members = community?.members ?? [];
    const missing = members.filter((uid) => !attemptedRef.current.has(uid));
    if (missing.length === 0) return;
    missing.forEach((uid) => attemptedRef.current.add(uid));
    let active = true;
    Promise.all(
      missing.map(async (uid) => {
        const u = await getDocument<MemberInfo>(`users/${uid}`);
        return [uid, u] as const;
      }),
    )
      .then((entries) => {
        if (!active) return;
        const resolved = entries.filter((e): e is [string, MemberInfo] => e[1] !== null);
        if (resolved.length === 0) return;
        setMemberUsers((prev) => ({ ...prev, ...Object.fromEntries(resolved) }));
      })
      .catch((err) => {
        // Let a failed batch be retried rather than silently showing placeholders.
        missing.forEach((uid) => attemptedRef.current.delete(uid));
        console.error('[community-details] member fetch failed:', err);
      });
    return () => { active = false; };
  }, [community?.members]);

  // Mute state lives on the user doc, so it is read once here rather than listened to.
  useEffect(() => {
    if (!currentUserId || !chatId) return;
    let active = true;
    getDocument<{ mutedChats?: string[] }>(`users/${currentUserId}`)
      .then((u) => { if (active) setMuted((u?.mutedChats ?? []).includes(chatId)); })
      .catch((err) => console.error('[community-details] mute state read failed:', err));
    return () => { active = false; };
  }, [currentUserId, chatId]);

  const backHref =
    `/${activeMode === 'client' ? '(client)' : '(professional)'}/(tabs)/chats?tab=communities`;

  if (isLoading) {
    return (
      <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.centered}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />
        <ActivityIndicator size="large" color="#004aad" />
      </LinearGradient>
    );
  }

  if (!community) {
    return (
      <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.centered}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />
        <Text style={[styles.errorText, { color: '#004aad', textAlign: align }]}>
          {t('community_details.not_found')}
        </Text>
      </LinearGradient>
    );
  }

  const members = community.members ?? [];
  const isOwner = currentUserId === community.ownerId;

  async function handleToggleMute(next: boolean) {
    if (!currentUserId || !chatId) return;
    setMuted(next); // optimistic, reverted below on failure
    try {
      if (next) await muteChat(currentUserId, chatId);
      else await unmuteChat(currentUserId, chatId);
    } catch (err) {
      console.error('[community-details] mute toggle failed:', err);
      setMuted(!next);
    }
  }

  async function handleLeave() {
    if (!currentUserId || !chatId) return;
    const confirmed = await confirmDialog(
      t('community_details.leave_confirm_title'),
      t('community_details.leave_confirm_body'),
    );
    if (!confirmed) return;
    setLeaving(true);
    try {
      await removeMemberFromGroup(chatId, currentUserId);
      // replace, not back(): back() would land on the chat we just left.
      router.replace(backHref as never);
    } catch (err) {
      console.error('[community-details] leave failed:', err);
      setLeaving(false);
    }
  }

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.container}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header — scrolls with content; negative margins cancel contentContainerStyle padding */}
        <View style={[styles.header, { marginHorizontal: -16, marginTop: -16 }]}>
          <TouchableOpacity
            onPress={() =>
              chatId
                ? router.push(`/(client)/(tabs)/chats/${chatId}` as never)
                : router.replace(backHref as never)
            }
            style={styles.headerBack}
            activeOpacity={0.7}
          >
            <AppText weight="regular" style={styles.headerBackText}>{'‹'}</AppText>
          </TouchableOpacity>
          <View style={styles.headerCenter} pointerEvents="none">
            <AppText weight="semiBold" style={styles.headerLabel}>
              {t('community_details.header')}
            </AppText>
          </View>
          <View style={styles.headerRight} />
        </View>

        {/* Identity card — photo, name, category */}
        <View style={styles.identityCard}>
          <CommunityAvatar community={community} size={96} />
          <AppText weight="bold" style={styles.communityName} numberOfLines={2}>
            {community.name}
          </AppText>
          {community.category && (
            <View style={styles.categoryChip}>
              <AppText weight="semiBold" style={styles.categoryChipText}>
                {categoryLabel(community.category, lang)}
              </AppText>
            </View>
          )}
        </View>

        {/* Bio */}
        {community.description ? (
          <View style={styles.descriptionCard}>
            <AppText weight="semiBold" style={styles.cardLabel}>{t('community_details.about')}</AppText>
            <AppText weight="regular" style={[styles.descriptionText, { textAlign: align }]}>
              {community.description}
            </AppText>
          </View>
        ) : null}

        {/* Members */}
        <View style={[styles.sectionHeaderRow, { flexDirection: rowDir }]}>
          <View style={[styles.sectionTitleGroup, { flexDirection: rowDir }]}>
            <AppText weight="bold" style={styles.sectionTitle}>{t('community_details.members')}</AppText>
            <AppText weight="regular" style={styles.sectionCount}>{String(members.length)}</AppText>
          </View>
        </View>

        {members.map((uid) => {
          const member = memberUsers[uid];
          const name = member?.displayName ?? '…';
          return (
            <View key={uid} style={styles.memberCard}>
              <View style={[styles.memberTopRow, { flexDirection: rowDir }]}>
                {member?.photoURL ? (
                  <Image source={{ uri: member.photoURL }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <AppText weight="bold" style={styles.avatarInitial}>
                      {name.charAt(0).toUpperCase()}
                    </AppText>
                  </View>
                )}
                <View style={[styles.memberNameRow, { flexDirection: rowDir }]}>
                  <AppText weight="bold" style={[styles.memberName, { textAlign: align }]} numberOfLines={1}>
                    {name}
                  </AppText>
                  {uid === community.ownerId && (
                    <View style={styles.ownerBadge}>
                      <AppText weight="bold" style={styles.ownerBadgeText}>
                        {t('community_details.owner')}
                      </AppText>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        })}

        {/* Notifications */}
        <View style={[styles.sectionHeaderRow, { flexDirection: rowDir }]}>
          <AppText weight="bold" style={styles.sectionTitle}>{t('community_details.notifications')}</AppText>
        </View>
        <View style={styles.settingCard}>
          <View style={[styles.settingRow, { flexDirection: rowDir }]}>
            <BellOff size={18} color="#8890b0" strokeWidth={1.8} />
            <AppText weight="semiBold" style={[styles.settingLabel, { textAlign: align }]}>
              {t('community_details.mute_label')}
            </AppText>
            <Switch
              value={muted}
              onValueChange={handleToggleMute}
              trackColor={{ true: '#1e4fa3', false: colors.borderMuted }}
            />
          </View>
          <AppText weight="regular" style={[styles.settingNote, { textAlign: align }]}>
            {t('community_details.mute_note')}
          </AppText>
        </View>

        {/* Leave */}
        {isOwner ? (
          <View style={styles.ownerNoteCard}>
            <AppText weight="regular" style={[styles.ownerNoteText, { textAlign: align }]}>
              {t('community_details.owner_cannot_leave')}
            </AppText>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.leavePill, { flexDirection: rowDir }]}
            onPress={handleLeave}
            disabled={leaving}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {leaving ? (
              <ActivityIndicator size="small" color="#e05656" />
            ) : (
              <>
                <LogOut size={15} color="#e05656" strokeWidth={2.2} />
                <AppText weight="semiBold" style={styles.leavePillText}>
                  {t('community_details.leave')}
                </AppText>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const CARD_SHADOW = {
  shadowColor: '#1e4fa3' as const,
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16 },

  content: { padding: 16, gap: 14, paddingBottom: 100 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingBottom: 20,
    paddingHorizontal: 8,
  },
  headerBack: { width: 40, alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  headerBackText: { fontSize: 36, color: '#1e4fa3', lineHeight: 44 },
  headerRight: { width: 40 },
  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  headerLabel: {
    fontSize: 11,
    color: '#8890b0',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },

  // ── Identity ────────────────────────────────────────────────────────────────
  identityCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
    ...CARD_SHADOW,
  },
  communityName: { fontSize: 20, color: '#1e4fa3', textAlign: 'center', lineHeight: 26 },
  categoryChip: {
    backgroundColor: 'rgba(30,79,163,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  categoryChipText: { fontSize: 12, color: '#1e4fa3' },

  // ── Bio ─────────────────────────────────────────────────────────────────────
  descriptionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
    ...CARD_SHADOW,
  },
  cardLabel: {
    fontSize: 10,
    color: '#8890b0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  descriptionText: { fontSize: 14, lineHeight: 20, color: '#3a4266' },

  // ── Section headers ─────────────────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1e4fa3' },
  sectionCount: { fontSize: 13, color: '#8890b0' },

  // ── Member cards ────────────────────────────────────────────────────────────
  memberCard: {
    padding: 13,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
    ...CARD_SHADOW,
  },
  memberTopRow: { alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { backgroundColor: '#1e4fa3', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  memberNameRow: { flex: 1, alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  // flexShrink so a long name truncates instead of pushing the owner badge out of the row.
  memberName: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: '#1e4fa3' },
  ownerBadge: {
    backgroundColor: '#1e4fa3',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ownerBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // ── Notifications ───────────────────────────────────────────────────────────
  settingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
    ...CARD_SHADOW,
  },
  settingRow: { alignItems: 'center', gap: 10 },
  settingLabel: { flex: 1, fontSize: 14, color: '#3a4266' },
  settingNote: { fontSize: 12, lineHeight: 17, color: '#8890b0' },

  // ── Leave ───────────────────────────────────────────────────────────────────
  leavePill: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fdecec',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  leavePillText: { fontSize: 14, color: '#e05656' },
  ownerNoteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
    marginTop: 4,
    ...CARD_SHADOW,
  },
  ownerNoteText: { fontSize: 13, lineHeight: 18, color: '#8890b0' },
});

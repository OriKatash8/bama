import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { Users } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { getCommunityInvite, type InviteLookup } from './inviteService';
import { inviteErrorKey, type InviteErrorKey } from './inviteErrors';
import { inviteExitHref } from './inviteExitHref';
import { requestToJoinViaInvite } from './joinViaInvite';

type Ready = Extract<InviteLookup, { exists: true; revoked: false }>;
type Load =
  | { status: 'loading' }
  | { status: 'error'; key: InviteErrorKey }
  | { status: 'missing' }
  | { status: 'revoked' }
  | { status: 'ready'; invite: Ready };

function makeT(translations: typeof en) {
  return (key: string): string => {
    let result: unknown = translations.community_invite;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

/**
 * What /c/[token] shows a signed-in, un-gated user: the community the link is for
 * and one state-aware action. Anyone signed in can ask to join; the owner's
 * approval is the only gate (no mode or profile requirement here).
 */
export function InvitePreviewScreen({ tokenOrCode }: { tokenOrCode: string }) {
  const colors = useTheme();
  const router = useRouter();
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(rtl ? he : en);
  const activeMode = useAuthStore((s) => s.activeMode);
  const user = useAuthStore((s) => s.user);
  const { showToast } = useUiStore();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [joining, setJoining] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const fetchInvite = useCallback(async () => {
    // A malformed link (the route passes '') is a miss; there is nothing to ask the backend.
    if (!tokenOrCode) { setLoad({ status: 'missing' }); return; }
    setLoad({ status: 'loading' });
    try {
      const r = await getCommunityInvite(tokenOrCode);
      if (!mounted.current) return;
      if (!r.exists) setLoad({ status: 'missing' });
      else if (r.revoked) setLoad({ status: 'revoked' });
      else setLoad({ status: 'ready', invite: r });
    } catch (e) {
      if (mounted.current) setLoad({ status: 'error', key: inviteErrorKey(e) });
    }
  }, [tokenOrCode]);
  useEffect(() => { void fetchInvite(); }, [fetchInvite]);

  const goHome = () => router.replace(inviteExitHref(activeMode, { to: 'home' }) as never);

  async function join(invite: Ready) {
    if (!user || joining) return;
    setJoining(true);
    try {
      await requestToJoinViaInvite({
        chatId: invite.communityId,
        token: invite.token,
        uid: user.id,
        displayName: user.displayName ?? '',
      });
      if (!mounted.current) return;
      setLoad({ status: 'ready', invite: { ...invite, membership: 'pending' } });
      showToast(t('preview.request_sent_toast'), 'success');
    } catch {
      showToast(t('preview.join_failed'), 'error');
    } finally {
      if (mounted.current) setJoining(false);
    }
  }

  const align = rtl ? 'right' : 'left';
  const center = { textAlign: 'center' as const };

  function body() {
    if (load.status === 'loading') {
      return (
        <View style={styles.block} testID="invite-loading">
          <ActivityIndicator color={colors.primary} />
          <AppText style={[center, { color: colors.textMuted }]}>{t('preview.loading')}</AppText>
        </View>
      );
    }
    if (load.status === 'error') {
      return (
        <View style={styles.block} testID="invite-error">
          <AppText style={[center, { color: colors.text }]}>{t(`errors.${load.key}`)}</AppText>
          <Action label={t('preview.retry')} onPress={fetchInvite} testID="invite-retry" />
          <Action label={t('preview.home_cta')} onPress={goHome} secondary testID="invite-home" />
        </View>
      );
    }
    if (load.status === 'missing' || load.status === 'revoked') {
      const k = load.status;
      return (
        <View style={styles.block} testID={`invite-${k}`}>
          <AppText weight="bold" style={[styles.title, center, { color: colors.text }]}>{t(`preview.${k}_title`)}</AppText>
          <AppText style={[center, { color: colors.textMuted }]}>{t(`preview.${k}_body`)}</AppText>
          <Action label={t('preview.home_cta')} onPress={goHome} testID="invite-home" />
        </View>
      );
    }
    const { invite } = load;
    return (
      <View style={styles.block} testID="invite-ready">
        <View style={[styles.avatar, { backgroundColor: colors.primary + '1A' }]}>
          {invite.avatarUrl ? (
            <Image source={{ uri: invite.avatarUrl }} style={styles.avatarImg} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <Users size={34} color={colors.primary} strokeWidth={1.8} />
          )}
        </View>
        {invite.membership === 'none' ? (
          <AppText style={[center, { color: colors.textMuted }]}>{t('preview.invited_to')}</AppText>
        ) : null}
        <AppText weight="bold" style={[styles.title, center, { color: colors.text }]} testID="invite-name">{invite.communityName}</AppText>
        {invite.description ? (
          <AppText style={[{ color: colors.textMuted, textAlign: align }, styles.desc]}>{invite.description}</AppText>
        ) : null}

        {invite.membership === 'none' ? (
          <>
            <Action
              label={joining ? t('preview.joining') : t('preview.join_cta')}
              onPress={() => join(invite)}
              disabled={joining}
              testID="invite-join"
            />
            <AppText style={[styles.note, center, { color: colors.textMuted }]}>{t('preview.join_note')}</AppText>
          </>
        ) : invite.membership === 'pending' ? (
          <>
            <AppText weight="semiBold" style={[center, { color: colors.text }]} testID="invite-pending">{t('preview.pending_title')}</AppText>
            <AppText style={[center, { color: colors.textMuted }]}>{t('preview.pending_body')}</AppText>
            <Action label={t('preview.home_cta')} onPress={goHome} secondary testID="invite-home" />
          </>
        ) : (
          <>
            <AppText weight="semiBold" style={[center, { color: colors.text }]} testID="invite-member">{t('preview.member_title')}</AppText>
            <Action
              label={t('preview.open_cta')}
              onPress={() => router.replace(inviteExitHref(activeMode, { to: 'community', chatId: invite.communityId }) as never)}
              testID="invite-open"
            />
          </>
        )}
      </View>
    );
  }

  function Action({ label, onPress, secondary, disabled, testID }: {
    label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; testID: string;
  }) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={testID}
        style={[
          styles.action,
          secondary ? { borderWidth: 1, borderColor: colors.primary } : { backgroundColor: colors.primary },
          disabled && { opacity: 0.6 },
        ]}
      >
        <AppText weight="semiBold" style={{ color: secondary ? colors.primary : '#ffffff' }}>{label}</AppText>
      </TouchableOpacity>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.page}>{body()}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  block: { alignItems: 'stretch', gap: 14 },
  avatar: { width: 84, height: 84, borderRadius: 42, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 84, height: 84 },
  title: { fontSize: 22 },
  desc: { fontSize: 14, lineHeight: 21 },
  note: { fontSize: 12 },
  action: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});

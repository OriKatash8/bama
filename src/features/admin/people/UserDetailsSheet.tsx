import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getDocument } from '@core/firebase/firestore';
import { formatPhoneForDisplay } from '@features/auth/utils/phone';
import { AdminText, InitialsAvatar, PillButton } from '@features/communityAdmin/components/primitives';
import { useAdminPalette, useScopedT } from '@features/communityAdmin/i18n';
import { SPACE, TYPE } from '@features/communityAdmin/theme';
import { AdminSheet } from '../ui/AdminSheet';
import { personName } from './personName';
import { useUserDirectory } from './userDirectory';

type UserDoc = {
  displayName?: string;
  photoURL?: string | null;
  createdAt?: { seconds?: number };
  moderation?: { status?: 'warned' | 'suspended'; reason?: string };
};

type Loaded = { uid: string; doc: UserDoc | null; phone: string | null; failed: boolean };

function fmtDate(seconds?: number): string {
  if (!seconds) return '—';
  const d = new Date(seconds * 1000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * More about one person, opened from the ⋮ beside their card. The card itself shows the full name; here is
 * everything else an admin may need, each value copyable: email (from Firebase Auth, via the directory),
 * phone (users/{uid}/private/contact, admin-readable), the user id, when they joined, and their standing.
 * "Open in Users" goes to the screen where they can be warned, suspended or messaged.
 *
 * `actions` are extra buttons for the screen that opened it (e.g. Communities' "Make owner").
 */
export function UserDetailsSheet({
  uid, name, visible, onClose, actions, testID = 'user-details',
}: {
  uid: string;
  /** The name the card already showed; used until the user document arrives. */
  name?: string;
  visible: boolean;
  onClose: () => void;
  /** Extra buttons; a function receives `close` so an action can dismiss the sheet when it is done. */
  actions?: ReactNode | ((close: () => void) => ReactNode);
  testID?: string;
}) {
  const p = useAdminPalette();
  const router = useRouter();
  const { t, rowDir, textAlign } = useScopedT('admin_people');
  const directory = useUserDirectory(visible);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    Promise.all([
      getDocument<UserDoc>(`users/${uid}`),
      // A failed private read shows as "no phone", not as a broken sheet.
      getDocument<{ phone?: string }>(`users/${uid}/private/contact`).catch(() => null),
    ]).then(
      ([doc, contact]) => {
        if (!live) return;
        const phone = typeof contact?.phone === 'string' && contact.phone ? contact.phone : null;
        setLoaded({ uid, doc, phone, failed: false });
      },
      (err: unknown) => {
        console.error('[admin/people] could not load user details:', err);
        if (live) setLoaded({ uid, doc: null, phone: null, failed: true });
      },
    );
    return () => { live = false; };
  }, [visible, uid]);

  const ready = loaded?.uid === uid;
  const doc = ready ? loaded.doc : null;
  const fullName = personName(doc?.displayName || directory.nameOf(uid) || name, t('unknown_user'), uid);
  const email = directory.emailOf(uid);
  const status = doc?.moderation?.status;
  const standing = t(status === 'suspended' ? 'standing_suspended' : status === 'warned' ? 'standing_warned' : 'standing_active');

  function openInUsers() {
    onClose();
    router.push(`/admin/users?uid=${encodeURIComponent(uid)}` as never);
  }

  return (
    <AdminSheet visible={visible} onClose={onClose} closeLabel={t('close')} testID={testID}>
      <View style={[styles.head, { flexDirection: rowDir }]}>
        {doc?.photoURL ? (
          <Image source={{ uri: doc.photoURL }} style={[styles.photo, { backgroundColor: p.surface3 }]} />
        ) : (
          <InitialsAvatar name={fullName} size={52} />
        )}
        <View style={styles.headText}>
          <AdminText weight="bold" accessibilityRole="header" style={[styles.title, { textAlign }]} testID={`${testID}-name`}>
            {fullName}
          </AdminText>
          <AdminText style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>{t('details_title')}</AdminText>
        </View>
      </View>

      {!ready ? (
        <ActivityIndicator color={p.accent} testID={`${testID}-loading`} style={styles.loading} />
      ) : loaded.failed ? (
        <AdminText style={[TYPE.rowMeta, { color: p.bad, textAlign }]}>{t('load_failed')}</AdminText>
      ) : null}

      <DetailRow label={t('email')} value={email ?? t('no_email')} muted={!email} selectable={!!email} testID={`${testID}-email`} />
      <Phone phone={ready ? loaded.phone : null} label={t('phone')} none={t('no_phone')} testID={`${testID}-phone`} />
      <DetailRow label={t('user_id')} value={uid} selectable testID={`${testID}-uid`} />
      <DetailRow label={t('joined')} value={fmtDate(doc?.createdAt?.seconds)} testID={`${testID}-joined`} />
      <DetailRow
        label={t('standing')}
        value={status && doc?.moderation?.reason ? `${standing} · ${doc.moderation.reason}` : standing}
        tone={status === 'suspended' ? 'bad' : status === 'warned' ? 'warn' : undefined}
        testID={`${testID}-standing`}
      />

      <View style={styles.actions}>
        {typeof actions === 'function' ? actions(onClose) : actions}
        <PillButton variant="primary" label={t('open_in_users')} onPress={openInUsers} block testID={`${testID}-open-users`} />
        <PillButton label={t('close')} onPress={onClose} block testID={`${testID}-close`} />
      </View>
    </AdminSheet>
  );
}

function DetailRow({
  label, value, selectable, muted, tone, testID,
}: { label: string; value: string; selectable?: boolean; muted?: boolean; tone?: 'bad' | 'warn'; testID?: string }) {
  const p = useAdminPalette();
  const { textAlign } = useScopedT('admin_people');
  return (
    <View style={styles.row}>
      <AdminText weight="semiBold" style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>{label}</AdminText>
      <AdminText
        selectable={selectable}
        testID={testID}
        style={[styles.value, { color: tone === 'bad' ? p.bad : tone === 'warn' ? p.warn : muted ? p.text3 : p.text, textAlign }]}
      >
        {value}
      </AdminText>
    </View>
  );
}

/** The phone: copyable, and a tap calls it. */
function Phone({ phone, label, none, testID }: { phone: string | null; label: string; none: string; testID: string }) {
  const p = useAdminPalette();
  const { textAlign } = useScopedT('admin_people');
  if (!phone) return <DetailRow label={label} value={none} muted testID={testID} />;
  return (
    <View style={styles.row}>
      <AdminText weight="semiBold" style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>{label}</AdminText>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`tel:${phone}`)}>
        <AdminText selectable tabular testID={testID} style={[styles.value, { color: p.accent, textAlign }]}>
          {formatPhoneForDisplay(phone)}
        </AdminText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 12 },
  headText: { flex: 1, minWidth: 0 },
  photo: { width: 52, height: 52, borderRadius: 26 },
  title: { fontSize: 18, letterSpacing: -0.2 },
  loading: { paddingVertical: 8 },
  row: { gap: 2 },
  value: { fontSize: 14, lineHeight: 21 },
  actions: { gap: 8, marginTop: SPACE.cardPad / 2 },
});

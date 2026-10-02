import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Phone, Search, ShieldAlert, ShieldBan, ShieldCheck, UserX, type LucideIcon } from 'lucide-react-native';
import { where } from 'firebase/firestore';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import { callFunction } from '@core/firebase/functions';
import { useUiStore } from '@core/stores/uiStore';
import { formatPhoneForDisplay } from '@features/auth/utils/phone';
import { HEEBO } from '@features/admin/ui';
import {
  AdminPage,
  AdminText,
  Card,
  CardHead,
  Chip,
  EmptyState,
  IconTile,
  InitialsAvatar,
  PillButton,
  Row,
  RADIUS,
  SPACE,
  TYPE,
  WhoBlock,
  useAdminPalette,
  useScopedT,
  type Tone,
} from '@features/admin/ui';
import type { User } from '@core/types/user';
import type { AdminAction, AdminActionType } from '@core/types/admin';

type ModerateArgs = { targetUid: string; action: AdminActionType; reason?: string; reportId?: string };
type ModerateResult = { success: boolean; actionId: string };
const moderateUser = callFunction<ModerateArgs, ModerateResult>('moderateUser');
/**
 * Every account, name + email. `users/{uid}` carries no `email` field — it was
 * readable by every signed-in user, which made the whole user base's addresses
 * enumerable. Auth holds the authoritative email; adminListUsers reads it with
 * the Admin SDK (functions/src/moderation/lookup.ts).
 */
type ListedUser = { uid: string; displayName: string; email: string | null; disabled: boolean; createdAt: number | null };
const adminListUsers = callFunction<Record<string, never>, { users: ListedUser[]; truncated: boolean }>('adminListUsers');
const sendSystemMessage = callFunction<{ targetUid: string; text: string }, { chatId: string }>('sendSystemMessage');

type Status = 'active' | 'warned' | 'suspended';
const STATUS_TONE: Record<Status, Tone> = { active: 'good', warned: 'warn', suspended: 'bad' };
const ACTION_TONE: Record<AdminActionType, Tone> = {
  warn: 'warn',
  suspend: 'bad',
  unsuspend: 'good',
  clear_warning: 'good',
};

function fmtDate(seconds?: number): string {
  if (!seconds) return '—';
  const d = new Date(seconds * 1000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Inputs: the browser's focus outline would sit inside their own border. */
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

/**
 * Every user, by name and email; tap one to see their moderation state and
 * history and to warn / suspend / message them — in the admin dashboard's
 * design. Opened from the dashboard's "total users" tile; not a tab.
 */
export default function UsersAdmin() {
  const p = useAdminPalette();
  const { t, rtl, rowDir, textAlign } = useScopedT('admin_users');
  const { showToast } = useUiStore();
  const router = useRouter();

  const [users, setUsers] = useState<ListedUser[]>([]);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  // Kept while a user is open, so "back to all users" returns to the same search.
  const [term, setTerm] = useState('');
  const shown = useMemo(() => {
    const q = term.trim().toLocaleLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      u.displayName.toLocaleLowerCase().includes(q) || (u.email ?? '').toLocaleLowerCase().includes(q));
  }, [users, term]);
  const [opening, setOpening] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<AdminAction[]>([]);
  /** The open user's phone (users/{uid}/private/contact — admin-readable); null when they have none. */
  const [phone, setPhone] = useState<string | null>(null);

  const [pending, setPending] = useState<AdminActionType | null>(null);
  const [reasonModal, setReasonModal] = useState<null | 'warn' | 'suspend'>(null);
  const [reason, setReason] = useState('');

  const [msgModal, setMsgModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  const status: Status = user?.moderation?.status ?? 'active';

  async function loadHistory(uid: string) {
    const items = await queryDocuments<AdminAction>('adminActions', where('targetUserId', '==', uid));
    items.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    setHistory(items);
  }

  const loadList = useCallback(async () => {
    setListState('loading');
    try {
      const res = await adminListUsers({});
      setUsers(res.users);
      setListState('ready');
    } catch {
      setListState('error');
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  /** Open one user: their document by uid, plus their action history. */
  async function openUser(listed: ListedUser) {
    setOpening(listed.uid);
    try {
      const doc = await getDocument<User>(`users/${listed.uid}`);
      if (!doc) { showToast(t('open_failed'), 'error'); return; }
      // `email` is not on the document — it rides along from Auth via the list.
      // The phone is private (users/{uid}/private/contact); a failed read shows as none.
      const contact = await getDocument<{ phone?: string }>(`users/${listed.uid}/private/contact`).catch(() => null);
      setPhone(typeof contact?.phone === 'string' && contact.phone ? contact.phone : null);
      setUser({ ...doc, email: listed.email ?? undefined });
      await loadHistory(listed.uid);
    } catch {
      showToast(t('open_failed'), 'error');
    } finally {
      setOpening(null);
    }
  }

  function backToList() {
    setUser(null);
    setPhone(null);
    setHistory([]);
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/admin' as never);
  }

  async function run(action: AdminActionType, withReason?: string) {
    if (!user) return;
    setPending(action);
    try {
      await moderateUser({ targetUid: user.id, action, reason: withReason });
      showToast(t('action_applied'), 'success');
      // By uid. This used to re-query by email, which is both a wasted query and
      // impossible now that the field is gone.
      const refreshed = await getDocument<User>(`users/${user.id}`);
      if (refreshed) setUser({ ...refreshed, email: user.email });
      await loadHistory(user.id);
    } catch (e) {
      showToast((e as { message?: string })?.message ?? t('action_failed'), 'error');
    } finally {
      setPending(null);
      setReasonModal(null);
      setReason('');
    }
  }

  function submitReason() {
    const r = reason.trim();
    if (!r) { showToast(t('reason_required'), 'error'); return; }
    if (reasonModal) run(reasonModal, r);
  }

  async function sendMessage() {
    if (!user) return;
    const text = messageText.trim();
    if (!text) { showToast(t('msg_required'), 'error'); return; }
    setSendingMsg(true);
    try {
      await sendSystemMessage({ targetUid: user.id, text });
      showToast(t('msg_sent'), 'success');
      setMsgModal(false);
      setMessageText('');
    } catch (e) {
      showToast((e as { message?: string })?.message ?? t('msg_failed'), 'error');
    } finally {
      setSendingMsg(false);
    }
  }

  const name = user ? user.displayName || t('unnamed') : '';

  return (
    <View style={styles.flex}>
      <AdminPage title={t('title')} subtitle={t('greeting')} onBack={goBack}>
        {!user && (
          <Card testID="users-list">
            <CardHead
              title={t('all_users')}
              side={listState === 'ready' ? <View testID="users-count"><Chip label={String(users.length)} tabular /></View> : undefined}
            />
            <View style={[styles.searchBar, { flexDirection: rowDir }]}>
              <View style={[styles.search, { flexDirection: rowDir, backgroundColor: p.surface2, borderColor: p.border }]}>
                <Search size={15} color={p.text3} strokeWidth={2.4} />
                <TextInput
                  style={[styles.searchInput, webNoOutline, { color: p.text, fontFamily: HEEBO.regular, textAlign }]}
                  value={term}
                  onChangeText={setTerm}
                  placeholder={t('search_placeholder')}
                  placeholderTextColor={p.text3}
                  accessibilityLabel={t('search_placeholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="users-search"
                />
              </View>
            </View>
            {listState === 'loading' ? (
              <View style={styles.listBusy}>
                <ActivityIndicator size="small" color={p.accent} testID="users-loading" />
              </View>
            ) : listState === 'error' ? (
              <View style={[styles.listError, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                <AdminText style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>{t('list_failed')}</AdminText>
                <PillButton variant="primary" label={t('retry')} onPress={() => void loadList()} testID="users-retry" />
              </View>
            ) : users.length === 0 ? (
              <EmptyState text={t('no_users')} testID="users-empty" />
            ) : shown.length === 0 ? (
              <EmptyState text={t('no_match')} testID="users-no-match" />
            ) : (
              shown.map((u) => {
                const label = u.displayName || t('unnamed');
                return (
                  <Row
                    key={u.uid}
                    rowDir={rowDir}
                    testID={`user-row-${u.uid}`}
                    onPress={() => void openUser(u)}
                    accessibilityLabel={`${label}, ${u.email ?? ''}`}
                  >
                    <InitialsAvatar name={u.displayName || u.email || '?'} />
                    <WhoBlock name={label} meta={u.email ?? '—'} textAlign={textAlign} />
                    {opening === u.uid && <ActivityIndicator size="small" color={p.accent} />}
                  </Row>
                );
              })
            )}
          </Card>
        )}

        {user && (
          <>
            <View style={{ flexDirection: rowDir }}>
              <PillButton label={t('back_to_list')} onPress={backToList} testID="back-to-list" />
            </View>
            {/* Who they are, their standing, and what can be done. */}
            <Card testID="user-card">
              <View style={[styles.who, { flexDirection: rowDir }]}>
                <InitialsAvatar name={name} size={44} />
                <WhoBlock name={name} meta={user.email ?? ''} textAlign={textAlign} />
                <StatusPill tone={STATUS_TONE[status]} label={t(`status_${status}`)} />
              </View>
              {/* Their phone number: tap to call. */}
              <Pressable
                testID="user-phone"
                disabled={!phone}
                onPress={() => phone && void Linking.openURL(`tel:${phone}`)}
                accessibilityRole={phone ? 'link' : undefined}
                accessibilityLabel={phone ? `${t('phone')} ${formatPhoneForDisplay(phone)}` : t('no_phone')}
                style={[styles.phoneRow, { flexDirection: rowDir, alignSelf: rtl ? 'flex-end' : 'flex-start' }]}
              >
                <Phone size={14} color={phone ? p.accent : p.text3} strokeWidth={2.2} />
                <AdminText
                  weight={phone ? 'semiBold' : 'regular'}
                  tabular
                  selectable
                  style={[TYPE.rowMeta, { color: phone ? p.accent : p.text3, textAlign }]}
                >
                  {phone ? formatPhoneForDisplay(phone) : t('no_phone')}
                </AdminText>
              </Pressable>
              <AdminText style={[styles.joined, { color: p.text3, textAlign }]}>
                {`${t('joined')} ${fmtDate(user.createdAt?.seconds)}`}
              </AdminText>

              {user.moderation && (
                <View
                  testID="moderation-reason"
                  style={[styles.reasonBox, { backgroundColor: status === 'suspended' ? p.badBg : p.warnBg }]}
                >
                  <AdminText
                    weight="semiBold"
                    style={[TYPE.statLabel, { color: status === 'suspended' ? p.bad : p.warn, textAlign }]}
                  >
                    {t(status === 'suspended' ? 'suspension_reason' : 'warning_reason')}
                  </AdminText>
                  <AdminText style={[styles.reasonText, { textAlign }]}>{user.moderation.reason}</AdminText>
                  <AdminText style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>
                    {`${t('by')} ${user.moderation.actorName} · ${fmtDate(user.moderation.at?.seconds)}`}
                  </AdminText>
                </View>
              )}

              <View style={[styles.actions, { flexDirection: rowDir, borderTopColor: p.border }]}>
                {status !== 'suspended' && (
                  <PillButton label={t('warn')} disabled={pending === 'warn'} onPress={() => setReasonModal('warn')} testID="action-warn" />
                )}
                {status === 'warned' && (
                  <PillButton
                    label={t('clear_warning')}
                    disabled={pending === 'clear_warning'}
                    onPress={() => run('clear_warning')}
                    testID="action-clear_warning"
                  />
                )}
                {status !== 'suspended' ? (
                  <PillButton
                    variant="danger"
                    label={t('suspend')}
                    disabled={pending === 'suspend'}
                    onPress={() => setReasonModal('suspend')}
                    testID="action-suspend"
                  />
                ) : (
                  <PillButton
                    variant="primary"
                    label={t('unsuspend')}
                    disabled={pending === 'unsuspend'}
                    onPress={() => run('unsuspend')}
                    testID="action-unsuspend"
                  />
                )}
                <PillButton label={t('message')} disabled={sendingMsg} onPress={() => setMsgModal(true)} testID="action-message" />
              </View>
            </Card>

            {/* Action history */}
            <Card testID="history-card">
              <CardHead title={t('action_history')} side={history.length > 0 ? <Chip label={String(history.length)} tabular /> : undefined} />
              {history.length === 0 ? (
                <EmptyState text={t('no_actions')} testID="history-empty" />
              ) : (
                history.map((h) => (
                  <Row key={h.id} rowDir={rowDir} testID={`history-${h.id}`}>
                    <IconTile icon={ACTION_ICON[h.action] ?? UserX} tone={ACTION_TONE[h.action] ?? 'neutral'} />
                    <View style={styles.logText}>
                      <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.rowName, { textAlign }]}>
                        {`${t(h.action)} · ${fmtDate(h.createdAt?.seconds)}`}
                      </AdminText>
                      {!!h.reason && (
                        <AdminText style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>{h.reason}</AdminText>
                      )}
                      <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
                        {`${t('by')} ${h.actorName}`}
                      </AdminText>
                    </View>
                  </Row>
                ))
              )}
            </Card>
          </>
        )}
      </AdminPage>

      {/* Reason sheet (warn / suspend) */}
      <Sheet visible={!!reasonModal} onClose={() => setReasonModal(null)} testID="reason-sheet">
        <SheetBody
          title={t(reasonModal === 'suspend' ? 'suspend_user' : 'warn_user')}
          hint={t('reason_hint')}
          value={reason}
          onChange={setReason}
          placeholder={t('reason_placeholder')}
          inputTestID="reason-input"
        >
          <PillButton label={t('cancel')} onPress={() => setReasonModal(null)} testID="reason-cancel" />
          <PillButton
            variant={reasonModal === 'suspend' ? 'danger' : 'primary'}
            label={t(reasonModal === 'suspend' ? 'suspend' : 'warn')}
            onPress={submitReason}
            disabled={!!pending}
            testID="reason-submit"
          />
        </SheetBody>
      </Sheet>

      {/* Send a BAMA System message */}
      <Sheet visible={msgModal} onClose={() => setMsgModal(false)} testID="message-sheet">
        <SheetBody
          title={t('msg_title')}
          hint={t('msg_hint')}
          value={messageText}
          onChange={setMessageText}
          placeholder={t('msg_placeholder')}
          inputTestID="message-input"
        >
          <PillButton label={t('cancel')} onPress={() => setMsgModal(false)} testID="message-cancel" />
          <PillButton variant="primary" label={t('send')} onPress={sendMessage} disabled={sendingMsg} testID="message-send" />
        </SheetBody>
      </Sheet>
    </View>
  );
}

const ACTION_ICON: Record<AdminActionType, LucideIcon> = {
  warn: ShieldAlert,
  suspend: ShieldBan,
  unsuspend: ShieldCheck,
  clear_warning: ShieldCheck,
};

/** The moderation status, tinted good / warn / bad. */
function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const p = useAdminPalette();
  const [bg, fg] = tone === 'good' ? [p.goodBg, p.good] : tone === 'warn' ? [p.warnBg, p.warn] : [p.badBg, p.bad];
  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]} testID="user-status">
      <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.chip, { color: fg }]}>
        {label}
      </AdminText>
    </View>
  );
}

/** A centred card over a dimmed page; tapping outside closes it. */
function Sheet({ visible, onClose, children, testID }: { visible: boolean; onClose: () => void; children: ReactNode; testID?: string }) {
  const p = useAdminPalette();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay} testID={testID}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim, { backgroundColor: p.shadow }]} onPress={onClose} accessible={false} />
        <View style={[styles.sheet, { backgroundColor: p.surface, borderColor: p.border }]}>{children}</View>
      </View>
    </Modal>
  );
}

function SheetBody({
  title,
  hint,
  value,
  onChange,
  placeholder,
  inputTestID,
  children,
}: {
  title: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputTestID: string;
  children: ReactNode;
}) {
  const p = useAdminPalette();
  const { rowDir, textAlign } = useScopedT('admin_users');
  return (
    <>
      <AdminText weight="bold" accessibilityRole="header" style={[styles.sheetTitle, { textAlign }]}>
        {title}
      </AdminText>
      <AdminText style={[styles.sheetHint, { color: p.text2, textAlign }]}>{hint}</AdminText>
      <TextInput
        style={[styles.sheetInput, webNoOutline, { color: p.text, borderColor: p.border, backgroundColor: p.surface2, fontFamily: HEEBO.regular, textAlign }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={p.text3}
        multiline
        testID={inputTestID}
      />
      <View style={[styles.sheetActions, { flexDirection: rowDir }]}>{children}</View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listBusy: { paddingVertical: 20, alignItems: 'center' },
  searchBar: { alignItems: 'center', gap: 10, paddingHorizontal: SPACE.rowPadH, paddingBottom: 10 },
  search: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  listError: { padding: SPACE.rowPadH, gap: 10 },
  who: { alignItems: 'center', gap: 12, paddingTop: 16, paddingHorizontal: SPACE.rowPadH },
  phoneRow: { alignItems: 'center', gap: 6, paddingTop: 10, paddingHorizontal: SPACE.rowPadH },
  joined: { fontSize: 12, paddingTop: 10, paddingHorizontal: SPACE.rowPadH },
  statusPill: { borderRadius: RADIUS.pill, paddingVertical: 3, paddingHorizontal: 10, flexShrink: 0 },
  reasonBox: { borderRadius: 14, padding: 12, marginTop: 12, marginHorizontal: SPACE.rowPadH, gap: 4 },
  reasonText: { fontSize: 13.5, lineHeight: 20 },
  actions: { flexWrap: 'wrap', gap: 8, marginTop: 16, paddingVertical: 14, paddingHorizontal: SPACE.rowPadH, borderTopWidth: 1 },
  logText: { flex: 1, minWidth: 0, gap: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  scrim: { opacity: 0.45 },
  sheet: { width: '100%', maxWidth: 440, borderRadius: RADIUS.card, borderWidth: 1, padding: 20, gap: 10 },
  sheetTitle: { fontSize: 19, letterSpacing: -0.3 },
  sheetHint: { fontSize: 13, lineHeight: 20 },
  sheetInput: { borderWidth: 1, borderRadius: 14, padding: 12, fontSize: 14, minHeight: 92, textAlignVertical: 'top' },
  sheetActions: { gap: 8, marginTop: 6, justifyContent: 'flex-end' },
});

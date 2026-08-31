import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, ShieldAlert, ShieldBan, ShieldCheck, UserX, MessageSquare } from 'lucide-react-native';
import { where } from 'firebase/firestore';
import { queryDocuments } from '@core/firebase/firestore';
import { callFunction } from '@core/firebase/functions';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { User } from '@core/types/user';
import type { AdminAction, AdminActionType } from '@core/types/admin';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

const HEADER_PURPLE = '#cb6ce6';

type ModerateArgs = { targetUid: string; action: AdminActionType; reason?: string; reportId?: string };
type ModerateResult = { success: boolean; actionId: string };
const moderateUser = callFunction<ModerateArgs, ModerateResult>('moderateUser');
const sendSystemMessage = callFunction<{ targetUid: string; text: string }, { chatId: string }>('sendSystemMessage');

const STATUS_COLOR: Record<'active' | 'warned' | 'suspended', string> = {
  active: '#4caf50',
  warned: '#ff9800',
  suspended: '#e53935',
};

function fmtDate(seconds?: number): string {
  if (!seconds) return '—';
  const d = new Date(seconds * 1000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function UsersAdmin() {
  const colors = useTheme();
  const font = useAppFont();
  const insets = useSafeAreaInsets();
  const { showToast } = useUiStore();
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(rtl ? he : en);
  const rowDir = rtl ? 'row-reverse' : 'row';
  const textAlign = rtl ? 'right' : 'left';

  const [term, setTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [history, setHistory] = useState<AdminAction[]>([]);

  const [pending, setPending] = useState<AdminActionType | null>(null);
  const [reasonModal, setReasonModal] = useState<null | 'warn' | 'suspend'>(null);
  const [reason, setReason] = useState('');

  const [msgModal, setMsgModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  const status: 'active' | 'warned' | 'suspended' = user?.moderation?.status ?? 'active';

  async function loadHistory(uid: string) {
    const items = await queryDocuments<AdminAction>('adminActions', where('targetUserId', '==', uid));
    items.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    setHistory(items);
  }

  async function search() {
    const value = term.trim();
    if (!value) return;
    setSearching(true);
    setNotFound(false);
    setUser(null);
    setHistory([]);
    try {
      let results = await queryDocuments<User>('users', where('email', '==', value));
      if (results.length === 0) {
        results = await queryDocuments<User>('users', where('displayName', '==', value));
      }
      if (results.length === 0) {
        setNotFound(true);
      } else {
        setUser(results[0]);
        await loadHistory(results[0].id);
      }
    } catch {
      showToast(t('admin_users.search_failed'), 'error');
    } finally {
      setSearching(false);
    }
  }

  async function run(action: AdminActionType, withReason?: string) {
    if (!user) return;
    setPending(action);
    try {
      await moderateUser({ targetUid: user.id, action, reason: withReason });
      showToast(t('admin_users.action_applied'), 'success');
      const refreshed = await queryDocuments<User>('users', where('email', '==', user.email));
      if (refreshed.length > 0) setUser(refreshed[0]);
      await loadHistory(user.id);
    } catch (e) {
      showToast((e as { message?: string })?.message ?? t('admin_users.action_failed'), 'error');
    } finally {
      setPending(null);
      setReasonModal(null);
      setReason('');
    }
  }

  function submitReason() {
    const r = reason.trim();
    if (!r) { showToast(t('admin_users.reason_required'), 'error'); return; }
    if (reasonModal) run(reasonModal, r);
  }

  async function sendMessage() {
    if (!user) return;
    const text = messageText.trim();
    if (!text) { showToast(t('admin_users.msg_required'), 'error'); return; }
    setSendingMsg(true);
    try {
      await sendSystemMessage({ targetUid: user.id, text });
      showToast(t('admin_users.msg_sent'), 'success');
      setMsgModal(false);
      setMessageText('');
    } catch (e) {
      showToast((e as { message?: string })?.message ?? t('admin_users.msg_failed'), 'error');
    } finally {
      setSendingMsg(false);
    }
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      {/* Header — flat solid purple */}
      <View style={[styles.header, { backgroundColor: HEADER_PURPLE, paddingTop: insets.top + 14, alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.greeting, { ...font.regular, textAlign }]}>{t('admin_users.greeting')}</Text>
        <Text style={[styles.headerTitle, { ...font.medium, textAlign }]}>{t('admin_users.title')}</Text>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Search */}
        <View style={[styles.searchRow, { flexDirection: rowDir, borderColor: colors.border, backgroundColor: colors.card }]}>
          <Search size={18} color={colors.textMuted} strokeWidth={2.5} />
          <TextInput
            style={[styles.searchInput, { ...font.regular, color: colors.text, textAlign }]}
            value={term}
            onChangeText={setTerm}
            placeholder={t('admin_users.search_placeholder')}
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={search}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchBtn} onPress={search} disabled={searching} activeOpacity={0.8}>
            {searching ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.searchBtnText, { ...font.semiBold }]}>{t('admin_users.search')}</Text>}
          </TouchableOpacity>
        </View>

        {notFound && (
          <Text style={[styles.hint, { ...font.regular, color: colors.textMuted, textAlign }]}>{t('admin_users.not_found')}</Text>
        )}

        {user && (
          <>
            {/* Detail card */}
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={[styles.cardHead, { flexDirection: rowDir }]}>
                <Text style={[styles.name, { ...font.bold, color: colors.text, textAlign }]} numberOfLines={1}>
                  {user.displayName || t('admin_users.unnamed')}
                </Text>
                <View style={[styles.badge, { backgroundColor: STATUS_COLOR[status] + '22' }]}>
                  <Text style={[styles.badgeText, { ...font.semiBold, color: STATUS_COLOR[status] }]}>{t(`admin_users.status_${status}`)}</Text>
                </View>
              </View>
              <Text style={[styles.meta, { ...font.regular, color: colors.textSec, textAlign }]}>{user.email}</Text>
              <Text style={[styles.meta, { ...font.regular, color: colors.textMuted, textAlign }]}>{`${t('admin_users.joined')} ${fmtDate(user.createdAt?.seconds)}`}</Text>

              {user.moderation && (
                <View style={[styles.reasonBox, { borderColor: STATUS_COLOR[status] + '55', backgroundColor: STATUS_COLOR[status] + '11' }]}>
                  <Text style={[styles.reasonLabel, { ...font.semiBold, color: STATUS_COLOR[status], textAlign }]}>
                    {t(status === 'suspended' ? 'admin_users.suspension_reason' : 'admin_users.warning_reason')}
                  </Text>
                  <Text style={[styles.reasonText, { ...font.regular, color: colors.text, textAlign }]}>{user.moderation.reason}</Text>
                  <Text style={[styles.reasonMeta, { ...font.regular, color: colors.textMuted, textAlign }]}>
                    {`${t('admin_users.by')} ${user.moderation.actorName} · ${fmtDate(user.moderation.at?.seconds)}`}
                  </Text>
                </View>
              )}
            </View>

            {/* Actions */}
            <View style={[styles.actions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              {status !== 'suspended' && (
                <ActionButton icon={ShieldAlert} label={t('admin_users.warn')} color="#ff9800" busy={pending === 'warn'} onPress={() => setReasonModal('warn')} font={font} dir={rowDir} />
              )}
              {status === 'warned' && (
                <ActionButton icon={ShieldCheck} label={t('admin_users.clear_warning')} color="#4caf50" busy={pending === 'clear_warning'} onPress={() => run('clear_warning')} font={font} dir={rowDir} />
              )}
              {status !== 'suspended' ? (
                <ActionButton icon={ShieldBan} label={t('admin_users.suspend')} color="#e53935" busy={pending === 'suspend'} onPress={() => setReasonModal('suspend')} font={font} dir={rowDir} />
              ) : (
                <ActionButton icon={ShieldCheck} label={t('admin_users.unsuspend')} color="#4caf50" busy={pending === 'unsuspend'} onPress={() => run('unsuspend')} font={font} dir={rowDir} />
              )}
              <ActionButton icon={MessageSquare} label={t('admin_users.message')} color="#004aad" busy={sendingMsg} onPress={() => setMsgModal(true)} font={font} dir={rowDir} />
            </View>

            {/* Action history */}
            <Text style={[styles.sectionTitle, { ...font.semiBold, color: colors.text, textAlign }]}>{t('admin_users.action_history')}</Text>
            {history.length === 0 ? (
              <Text style={[styles.hint, { ...font.regular, color: colors.textMuted, textAlign }]}>{t('admin_users.no_actions')}</Text>
            ) : (
              history.map((h) => (
                <View key={h.id} style={[styles.logRow, { flexDirection: rowDir, borderColor: colors.border }]}>
                  <UserX size={16} color={colors.textMuted} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.logAction, { ...font.semiBold, color: colors.text, textAlign }]}>
                      {`${t(`admin_users.${h.action}`)} · ${fmtDate(h.createdAt?.seconds)}`}
                    </Text>
                    {!!h.reason && <Text style={[styles.logReason, { ...font.regular, color: colors.textSec, textAlign }]}>{h.reason}</Text>}
                    <Text style={[styles.logMeta, { ...font.regular, color: colors.textMuted, textAlign }]}>{`${t('admin_users.by')} ${h.actorName}`}</Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Reason modal (warn / suspend) */}
      <Modal visible={!!reasonModal} transparent animationType="fade" onRequestClose={() => setReasonModal(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setReasonModal(null)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { ...font.bold, color: colors.text, textAlign }]}>
              {t(reasonModal === 'suspend' ? 'admin_users.suspend_user' : 'admin_users.warn_user')}
            </Text>
            <Text style={[styles.modalHint, { ...font.regular, color: colors.textMuted, textAlign }]}>{t('admin_users.reason_hint')}</Text>
            <TextInput
              style={[styles.reasonInput, { ...font.regular, color: colors.text, borderColor: colors.border, backgroundColor: colors.bg, textAlign }]}
              value={reason}
              onChangeText={setReason}
              placeholder={t('admin_users.reason_placeholder')}
              placeholderTextColor={colors.placeholder}
              multiline
            />
            <View style={[styles.modalActions, { flexDirection: rowDir }]}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.inputBg }]} onPress={() => setReasonModal(null)} activeOpacity={0.8}>
                <Text style={[styles.modalBtnText, { ...font.semiBold, color: colors.textSec }]}>{t('admin_users.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: reasonModal === 'suspend' ? '#e53935' : '#ff9800' }]}
                onPress={submitReason}
                disabled={!!pending}
                activeOpacity={0.85}
              >
                {pending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.modalBtnText, { ...font.semiBold, color: '#fff' }]}>{t(reasonModal === 'suspend' ? 'admin_users.suspend' : 'admin_users.warn')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Send a BAMA System message */}
      <Modal visible={msgModal} transparent animationType="fade" onRequestClose={() => setMsgModal(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setMsgModal(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { ...font.bold, color: colors.text, textAlign }]}>{t('admin_users.msg_title')}</Text>
            <Text style={[styles.modalHint, { ...font.regular, color: colors.textMuted, textAlign }]}>{t('admin_users.msg_hint')}</Text>
            <TextInput
              style={[styles.reasonInput, { ...font.regular, color: colors.text, borderColor: colors.border, backgroundColor: colors.bg, textAlign }]}
              value={messageText}
              onChangeText={setMessageText}
              placeholder={t('admin_users.msg_placeholder')}
              placeholderTextColor={colors.placeholder}
              multiline
            />
            <View style={[styles.modalActions, { flexDirection: rowDir }]}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.inputBg }]} onPress={() => setMsgModal(false)} activeOpacity={0.8}>
                <Text style={[styles.modalBtnText, { ...font.semiBold, color: colors.textSec }]}>{t('admin_users.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#004aad' }]} onPress={sendMessage} disabled={sendingMsg} activeOpacity={0.85}>
                {sendingMsg ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.modalBtnText, { ...font.semiBold, color: '#fff' }]}>{t('admin_users.send')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ActionButton({
  icon: Icon, label, color, busy, onPress, font, dir,
}: {
  icon: typeof ShieldAlert;
  label: string;
  color: string;
  busy: boolean;
  onPress: () => void;
  font: ReturnType<typeof useAppFont>;
  dir: 'row' | 'row-reverse';
}) {
  return (
    <TouchableOpacity style={[styles.actionBtn, { flexDirection: dir, borderColor: color }]} onPress={onPress} disabled={busy} activeOpacity={0.8}>
      {busy ? <ActivityIndicator size="small" color={color} /> : (
        <>
          <Icon size={16} color={color} strokeWidth={2.2} />
          <Text style={[styles.actionText, { ...font.semiBold, color }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingBottom: 14, paddingHorizontal: 16, gap: 2 },
  greeting: { fontSize: 11, color: 'rgba(255,255,255,0.7)', width: '100%' },
  headerTitle: { fontSize: 17, color: '#ffffff', width: '100%' },

  content: { padding: 16, paddingBottom: 100 },
  searchRow: { alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 6 },
  searchBtn: { backgroundColor: '#004aad', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  searchBtnText: { color: '#fff', fontSize: 13 },
  hint: { fontSize: 14, marginTop: 12, width: '100%' },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 16, gap: 6 },
  cardHead: { justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 18 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 12 },
  meta: { fontSize: 13 },
  reasonBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 6, gap: 3 },
  reasonLabel: { fontSize: 12 },
  reasonText: { fontSize: 14, lineHeight: 20 },
  reasonMeta: { fontSize: 11 },
  actions: { flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: { alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  actionText: { fontSize: 13 },
  sectionTitle: { fontSize: 16, marginTop: 22, marginBottom: 8, width: '100%' },
  logRow: { alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  logAction: { fontSize: 13 },
  logReason: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  logMeta: { fontSize: 11, marginTop: 2 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 18, padding: 18, gap: 10 },
  modalTitle: { fontSize: 18 },
  modalHint: { fontSize: 13 },
  reasonInput: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14, minHeight: 84, textAlignVertical: 'top' },
  modalActions: { gap: 8, marginTop: 4 },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  modalBtnText: { fontSize: 14 },
});

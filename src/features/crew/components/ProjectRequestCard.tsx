import { useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { router, useSegments } from 'expo-router';
import {
  MessageCircle,
  Pencil,
  Trash2,
  CalendarDays,
  CalendarCheck,
  MapPin,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Users,
} from 'lucide-react-native';
import type { ProjectRequest } from '@core/types/project';
import { useProjectTeam } from '@features/offers/hooks/useProjectTeam';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import { deleteProjectAndOffers } from '@features/crew/services/projectDeletion';
import { useUiStore } from '@core/stores/uiStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

const CARD_SHADOW = {
  shadowColor: '#1e4fa3',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
} as const;

const BLUE = '#1e4fa3';
const MUTED = '#8890b0';
const BORDER_LIGHT = 'rgba(30,79,163,0.12)';
const GREEN = '#1c9d63';
const PURPLE = '#cb6ce6';
const REJECT_RED = '#e04b4b';
const STAT_BG = '#f5f6fb';
const MENU_WIDTH = 130;

type Props = { request: ProjectRequest };

function formatDateCompact(iso?: string, flexibleLabel?: string): string {
  if (!iso) return '—';
  if (iso === 'flexible') return flexibleLabel ?? '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}

export function ProjectRequestCard({ request }: Props) {
  const [teamOpen, setTeamOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);
  const [menuY, setMenuY] = useState(0);
  const [menuX, setMenuX] = useState(0);

  const { team, isLoading: teamLoading, load } = useProjectTeam(request.id);
  const { showToast } = useUiStore();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const segments = useSegments();
  const modeSegment = segments[0];

  const moreBtnRef = useRef<View>(null);

  const filledCount = request.filledSlots?.length ?? 0;
  const totalSlots = request.crewSlots.reduce((acc, s) => acc + s.quantity, 0);
  const isTeamFull = totalSlots > 0 && filledCount >= totalSlots;
  const teamColor = isTeamFull ? GREEN : PURPLE;
  const canEdit = request.status === 'open';

  function handleEdit() {
    router.navigate({
      pathname: '/(client)/(tabs)/home' as any,
      params: { projectId: request.id },
    });
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteProjectAndOffers(request.id, request.chatId);
      showToast(t('chats_page.project_deleted'), 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('chats_page.project_delete_error'), 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  function toggleTeam() {
    const next = !teamOpen;
    setTeamOpen(next);
    if (next) load();
  }

  function openMoreMenu() {
    moreBtnRef.current?.measureInWindow((x, y, width, height) => {
      setMenuY(y + height + 4);
      setMenuX(rtl ? x + width - MENU_WIDTH : x);
      setMoreMenuVisible(true);
    });
  }

  return (
    <View style={styles.card}>
      {/* Zone 1 — Header: ⋯ on leading corner + project title */}
      <View style={[styles.headerRow, { flexDirection: rowDir }]}>
        <View ref={moreBtnRef}>
          <TouchableOpacity
            onPress={openMoreMenu}
            style={styles.moreBtn}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <MoreHorizontal size={20} color={BLUE} />
          </TouchableOpacity>
        </View>
        <AppText
          weight="bold"
          style={[styles.title, { textAlign: rtl ? 'right' : 'left' }]}
          numberOfLines={2}
        >
          {request.title}
        </AppText>
      </View>

      {/* Zone 2 — Three stat squares: location / end date / execution */}
      <View style={[styles.statsRow, { flexDirection: rowDir }]}>
        <View style={styles.statSquare}>
          <MapPin size={14} color={MUTED} strokeWidth={1.5} />
          <AppText weight="regular" style={styles.statLabel}>
            {t('chats_page.stat_location')}
          </AppText>
          <AppText weight="bold" style={styles.statValue} numberOfLines={1}>
            {request.location || '—'}
          </AppText>
        </View>

        <View style={styles.statSquare}>
          <CalendarDays size={14} color={MUTED} strokeWidth={1.5} />
          <AppText weight="regular" style={styles.statLabel}>
            {t('chats_page.stat_deadline')}
          </AppText>
          <AppText weight="bold" style={styles.statValue} numberOfLines={1}>
            {formatDateCompact(request.deadline, t('builder.flexible'))}
          </AppText>
        </View>

        <View style={styles.statSquare}>
          <CalendarCheck size={14} color={MUTED} strokeWidth={1.5} />
          <AppText weight="regular" style={styles.statLabel}>
            {t('chats_page.stat_execution')}
          </AppText>
          <AppText weight="bold" style={styles.statValue} numberOfLines={1}>
            {formatDateCompact(request.exec)}
          </AppText>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Zone 3 — Bottom row: team indicator (leading) + action buttons (trailing) */}
      <View style={[styles.bottomRow, { flexDirection: rowDir }]}>
        <TouchableOpacity
          style={[styles.teamBtn, { flexDirection: rowDir }]}
          onPress={toggleTeam}
          activeOpacity={0.7}
        >
          <Users size={11} color={teamColor} strokeWidth={1.8} />
          <AppText weight="semiBold" style={[styles.teamBtnText, { color: teamColor }]}>
            {t('chats_page.team_label')} ({filledCount}/{totalSlots})
          </AppText>
          {teamOpen
            ? <ChevronUp size={11} color={teamColor} />
            : <ChevronDown size={11} color={teamColor} />}
        </TouchableOpacity>

        <View style={[styles.actions, { flexDirection: rowDir }]}>
          {!!request.chatId && (
            <TouchableOpacity
              style={[styles.chatBtn, { flexDirection: rowDir }]}
              onPress={() => router.push(`/${modeSegment}/(tabs)/chats/${request.chatId}` as never)}
              activeOpacity={0.8}
            >
              <MessageCircle size={13} color="#ffffff" strokeWidth={2} />
              <AppText weight="semiBold" style={styles.chatBtnText}>
                {t('chats_page.open_chat')}
              </AppText>
            </TouchableOpacity>
          )}
          {canEdit && (
            <TouchableOpacity
              style={[styles.editBtn, { flexDirection: rowDir }]}
              onPress={handleEdit}
              activeOpacity={0.8}
            >
              <Pencil size={13} color={BLUE} strokeWidth={2} />
              <AppText weight="semiBold" style={styles.editBtnText}>
                {t('chats_page.edit_project')}
              </AppText>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Team expanded section */}
      {teamOpen && (
        <View style={styles.teamSection}>
          {teamLoading ? (
            <ActivityIndicator size="small" color={PURPLE} />
          ) : (
            request.crewSlots.map((slot, i) => {
              const filled = request.filledSlots?.find(
                (f) =>
                  f.category === slot.category &&
                  (f.requiredCapability ?? undefined) === (slot.requiredCapability ?? undefined),
              );
              const member = team.find(
                (m) => m.professionalId === filled?.professionalId && m.category === slot.category,
              );
              return (
                <View key={i} style={[styles.teamChip, member ? styles.teamChipFilled : styles.teamChipOpen]}>
                  <AppText
                    weight="semiBold"
                    style={[styles.teamRole, { textAlign: rtl ? 'right' : 'left', color: member ? '#ffffff' : BLUE }]}
                  >
                    {slot.category}
                  </AppText>
                  {member ? (
                    <AppText
                      weight="regular"
                      style={[styles.teamName, { textAlign: rtl ? 'right' : 'left', color: 'rgba(255,255,255,0.8)' }]}
                    >
                      {member.displayName} · ₪{member.price.toLocaleString()}
                    </AppText>
                  ) : (
                    <AppText
                      weight="semiBold"
                      style={[styles.teamOpen, { textAlign: rtl ? 'right' : 'left', color: BLUE }]}
                    >
                      — {t('chats_page.open_slot')}
                    </AppText>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}

      {/* Delete confirmation panel (inline, existing pattern) */}
      {confirmingDelete && (
        <View style={styles.confirmRow}>
          <AppText weight="regular" style={styles.confirmText}>
            {t('chats_page.delete_confirm_body')}
          </AppText>
          <View style={styles.confirmBtns}>
            <TouchableOpacity
              style={styles.confirmCancel}
              onPress={() => setConfirmingDelete(false)}
              activeOpacity={0.7}
            >
              <AppText weight="semiBold" style={styles.confirmCancelText}>
                {t('chats_page.delete_confirm_cancel')}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmYes}
              onPress={() => { setConfirmingDelete(false); handleDelete(); }}
              activeOpacity={0.7}
              disabled={isDeleting}
            >
              {isDeleting
                ? <ActivityIndicator size="small" color="#fff" />
                : (
                  <AppText weight="semiBold" style={styles.confirmYesText}>
                    {t('chats_page.delete_confirm_ok')}
                  </AppText>
                )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ⋯ overflow menu — transparent Modal with measured position */}
      <Modal
        visible={moreMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMoreMenuVisible(false)}
      >
        {/* Full-screen backdrop — tap to close */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={() => setMoreMenuVisible(false)}
          activeOpacity={1}
        />
        {/* Floating menu panel at measured coords */}
        <View
          style={[styles.moreMenuPanel, { top: menuY, left: menuX }]}
          onStartShouldSetResponder={() => true}
        >
          <TouchableOpacity
            style={styles.moreMenuItemRow}
            onPress={() => { setMoreMenuVisible(false); setConfirmingDelete(true); }}
            activeOpacity={0.7}
          >
            <Trash2 size={14} color={REJECT_RED} strokeWidth={1.8} />
            <AppText weight="semiBold" style={styles.moreMenuItemText}>
              {t('chats_page.delete_confirm_ok')}
            </AppText>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginVertical: 6,
    marginHorizontal: 12,
    gap: 12,
    ...CARD_SHADOW,
  },
  // Zone 1
  headerRow: {
    alignItems: 'center',
    gap: 10,
  },
  moreBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  title: {
    flex: 1,
    fontSize: 17,
    color: BLUE,
    lineHeight: 23,
  },
  // Zone 2
  statsRow: {
    gap: 8,
  },
  statSquare: {
    flex: 1,
    backgroundColor: STAT_BG,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    color: MUTED,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 12,
    color: BLUE,
    textAlign: 'center',
  },
  // Divider
  divider: {
    height: 1,
    backgroundColor: BORDER_LIGHT,
  },
  // Zone 3
  bottomRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  teamBtn: {
    alignItems: 'center',
    gap: 4,
  },
  teamBtnText: {
    fontSize: 10,
  },
  actions: {
    alignItems: 'center',
    gap: 8,
  },
  chatBtn: {
    alignItems: 'center',
    gap: 5,
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chatBtnText: {
    color: '#ffffff',
    fontSize: 12,
  },
  editBtn: {
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderColor: BLUE,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  editBtnText: {
    color: BLUE,
    fontSize: 12,
  },
  // Team expansion
  teamSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'center',
  },
  teamChip: {
    borderWidth: 1.5,
    borderColor: BLUE,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  teamChipFilled: { backgroundColor: BLUE },
  teamChipOpen: { backgroundColor: '#ffffff' },
  teamRole: { fontSize: 10 },
  teamName: { fontSize: 9, marginTop: 1 },
  teamOpen: { fontSize: 9, marginTop: 1 },
  // Delete confirmation
  confirmRow: {
    gap: 12,
    justifyContent: 'center',
    minHeight: 60,
  },
  confirmText: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
  },
  confirmBtns: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  confirmCancel: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  confirmCancelText: {
    fontSize: 14,
    color: MUTED,
  },
  confirmYes: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e53935',
    minWidth: 70,
    alignItems: 'center',
  },
  confirmYesText: {
    fontSize: 14,
    color: '#fff',
  },
  // Overflow menu
  moreMenuPanel: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 4,
    width: MENU_WIDTH,
    shadowColor: '#1e4fa3',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  moreMenuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  moreMenuItemText: {
    fontSize: 14,
    color: REJECT_RED,
  },
});

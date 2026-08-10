import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { router, useSegments } from 'expo-router';
import { MessageCircle, Pencil, Trash2, CalendarDays, MapPin } from 'lucide-react-native';
import type { ProjectRequest } from '@core/types/project';
import { useProjectTeam } from '@features/offers/hooks/useProjectTeam';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { deleteDocument } from '@core/firebase/firestore';
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

type Props = { request: ProjectRequest };

const STATUS_CONFIG: Record<ProjectRequest['status'], { bg: string; text: string }> = {
  open:        { bg: '#dcfce7', text: '#166534' },
  in_progress: { bg: '#dbeafe', text: '#1e40af' },
  completed:   { bg: '#f3f4f6', text: '#6b7280' },
  cancelled:   { bg: '#fee2e2', text: '#dc2626' },
};

const STATUS_LABEL_KEY: Record<ProjectRequest['status'], string> = {
  open: 'chats.status_open',
  in_progress: 'chats.status_in_progress',
  completed: 'chats.status_completed',
  cancelled: 'chats.status_cancelled',
};

function formatDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function ProjectRequestCard({ request }: Props) {
  const [teamOpen, setTeamOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { team, isLoading: teamLoading, load } = useProjectTeam(request.id);
  const colors = useTheme();
  const font = useAppFont();
  const { showToast } = useUiStore();
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : 'row' as const;
  const t = makeT(language === 'he' ? he : en);
  const segments = useSegments();
  const modeSegment = segments[0];

  function handleEdit() {
    router.navigate({
      pathname: '/(client)/(tabs)/home' as any,
      params: { projectId: request.id },
    });
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteDocument(`projects/${request.id}`);
      showToast(t('chats_page.project_deleted'), 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('chats_page.project_delete_error'), 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  function confirmAndDelete() {
    Alert.alert(
      t('chats_page.delete_confirm_title'),
      t('chats_page.delete_confirm_body'),
      [
        { text: t('chats_page.delete_confirm_cancel'), style: 'cancel' },
        { text: t('chats_page.delete_confirm_ok'), style: 'destructive', onPress: handleDelete },
      ]
    );
  }

  function toggleTeam() {
    const next = !teamOpen;
    setTeamOpen(next);
    if (next) load();
  }

  const filledCount = request.filledSlots?.length ?? 0;
  const totalSlots = request.crewSlots.reduce((acc, s) => acc + s.quantity, 0);
  const isTeamFull = totalSlots > 0 && filledCount >= totalSlots;
  const canEdit = request.status === 'open';
  const deadlineStr = request.deadline === 'flexible' ? t('builder.flexible') : formatDate(request.deadline);
  const locationStr = request.location ?? '';

  return (
    <View style={[styles.card, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
      {/* Header: title + inline status badge */}
      <View style={[styles.headerRow, { flexDirection: rowDir }]}>
        <Text
          style={[styles.title, { ...font.forText(request.title, 'bold'), color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}
          numberOfLines={2}
        >
          {request.title}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[request.status].bg }]}>
          <Text style={[styles.statusBadgeText, { ...font.semiBold, color: STATUS_CONFIG[request.status].text }]}>
            {t(STATUS_LABEL_KEY[request.status])}
          </Text>
        </View>
      </View>

      {/* Details: deadline + location, hidden when empty */}
      {(!!deadlineStr || !!locationStr) && (
        <View style={[styles.detailsRow, { flexDirection: rowDir }]}>
          {!!deadlineStr && (
            <View style={[styles.detailItem, { flexDirection: rowDir }]}>
              <CalendarDays size={13} color={colors.textMuted} strokeWidth={1.5} />
              <Text style={[styles.detailText, { ...font.regular, color: colors.textMuted }]}>
                {deadlineStr}
              </Text>
            </View>
          )}
          {!!locationStr && (
            <View style={[styles.detailItem, { flexDirection: rowDir }]}>
              <MapPin size={13} color={colors.textMuted} strokeWidth={1.5} />
              <Text style={[styles.detailText, { ...font.forText(locationStr, 'regular'), color: colors.textMuted }]} numberOfLines={1}>
                {locationStr}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Team section */}
      {filledCount > 0 && (
        <TouchableOpacity onPress={toggleTeam} style={[styles.teamToggle, { alignSelf: rtl ? 'flex-end' : 'flex-start' }]} activeOpacity={0.7}>
          <Text style={[styles.teamToggleText, { ...font.semiBold, color: isTeamFull ? '#22c55e' : '#cb6ce6' }]}>
            {teamOpen ? '▴' : '▾'} Team ({filledCount})
          </Text>
        </TouchableOpacity>
      )}

      {teamOpen && (
        <View style={styles.teamSection}>
          {teamLoading ? (
            <ActivityIndicator size="small" color="#cb6ce6" />
          ) : (
            <>
              {request.crewSlots.map((slot, i) => {
                const filled = request.filledSlots?.find(
                  (f) => f.category === slot.category
                );
                const member = team.find(
                  (m) => m.professionalId === filled?.professionalId && m.category === slot.category
                );
                return (
                  <View key={i} style={[styles.teamRow, { flexDirection: rowDir }]}>
                    <View style={styles.teamDot} />
                    <View style={styles.teamInfo}>
                      <Text style={[styles.teamRole, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.forText(slot.category, 'semiBold') }]}>{slot.category}</Text>
                      {member ? (
                        <Text style={[styles.teamName, { color: colors.textSec, textAlign: rtl ? 'right' : 'left', ...font.forText(member.displayName, 'regular') }]}>{member.displayName} · ${member.price.toLocaleString()}</Text>
                      ) : (
                        <Text style={[styles.teamOpen, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>— Open</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>
      )}

      <View style={styles.divider} />

      {/* Actions row */}
      <View style={[styles.actionsRow, { flexDirection: rowDir }]}>
        <View style={[styles.primaryActions, { flexDirection: rowDir }]}>
          {!!request.chatId && (
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() => router.push(`/${modeSegment}/(tabs)/chats/${request.chatId}` as never)}
              activeOpacity={0.8}
            >
              <MessageCircle size={14} color="#ffffff" strokeWidth={2} />
              <Text style={[styles.chatBtnText, { ...font.semiBold }]}>{t('chats_page.open_chat')}</Text>
            </TouchableOpacity>
          )}
          {canEdit && (
            <TouchableOpacity style={styles.editBtn} onPress={handleEdit} activeOpacity={0.8}>
              <Pencil size={14} color="#004aad" strokeWidth={2} />
              <Text style={[styles.editBtnText, { ...font.semiBold }]}>{t('chats_page.edit_project')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {canEdit && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={confirmAndDelete}
            activeOpacity={0.7}
            disabled={isDeleting}
          >
            {isDeleting
              ? <ActivityIndicator size="small" color="#dc2626" />
              : <Trash2 size={18} color="#dc2626" strokeWidth={1.5} />
            }
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    gap: 10,
    marginVertical: 6,
  },
  headerRow: {
    alignItems: 'flex-start',
    gap: 10,
  },
  title: { fontSize: 18, lineHeight: 24, flex: 1 },
  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  statusBadgeText: { fontSize: 11 },
  detailsRow: {
    flexWrap: 'wrap',
    gap: 12,
  },
  detailItem: {
    alignItems: 'center',
    gap: 4,
  },
  detailText: { fontSize: 12 },
  teamToggle: {},
  teamToggleText: { fontSize: 13 },
  teamSection: { gap: 8 },
  teamRow: { alignItems: 'center', gap: 10 },
  teamDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#cb6ce6' },
  teamInfo: { flex: 1 },
  teamRole: { fontSize: 13 },
  teamName: { fontSize: 12, marginTop: 1 },
  teamOpen: { fontSize: 12, marginTop: 1 },
  divider: { height: 1, backgroundColor: '#e0e0e0' },
  actionsRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryActions: {
    gap: 8,
    alignItems: 'center',
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chatBtnText: { color: '#ffffff', fontSize: 13 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#004aad',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editBtnText: { color: '#004aad', fontSize: 13 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

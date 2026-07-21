import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { router, useSegments } from 'expo-router';
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

const STATUS_COLORS: Record<ProjectRequest['status'], string> = {
  open: '#9e9e9e',
  in_progress: '#FF9800',
  completed: '#4CAF50',
  cancelled: '#757575',
};

const STATUS_LABEL_KEY: Record<ProjectRequest['status'], string> = {
  open: 'chats.status_open',
  in_progress: 'chats.status_in_progress',
  completed: 'chats.status_completed',
  cancelled: 'chats.status_cancelled',
};

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function ProjectRequestCard({ request }: Props) {
  const [teamOpen, setTeamOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
      showToast('Project deleted', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to delete project', 'error');
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }

  const firstTwo = request.crewSlots.slice(0, 2);
  const overflow = request.crewSlots.length - 2;
  const crewSummary = [
    ...firstTwo.map((s) => `${s.quantity}× ${s.subcategory}`),
    overflow > 0 ? `+${overflow} more` : null,
  ]
    .filter(Boolean)
    .join(', ');

  function toggleTeam() {
    const next = !teamOpen;
    setTeamOpen(next);
    if (next) load();
  }

  const filledCount = request.filledSlots?.length ?? 0;
  const canEdit = request.status === 'open';

  return (
    <View style={styles.cardWrap}>
      <View
        style={[
          styles.statusBadge,
          { backgroundColor: STATUS_COLORS[request.status] },
          rtl ? styles.statusBadgeLeft : styles.statusBadgeRight,
        ]}
      >
        <Text style={[styles.statusBadgeText, { fontFamily: font.semiBold }]}>
          {t(STATUS_LABEL_KEY[request.status])}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
        <Text
          style={[styles.title, { color: '#004aad', textAlign: rtl ? 'right' : 'left', fontFamily: font.bold }]}
          numberOfLines={1}
        >
          {request.title}
        </Text>

        <View style={[styles.infoRow, { flexDirection: rowDir }]}>
          <View style={styles.infoCol}>
            <Text style={[styles.infoLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left', fontFamily: font.regular }]}>
              {t('project_details.execution')}
            </Text>
            <Text style={[styles.infoValue, { textAlign: rtl ? 'right' : 'left', fontFamily: font.bold }]}>
              {formatDate(request.exec)}
            </Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={[styles.infoLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left', fontFamily: font.regular }]}>
              {t('project_details.deadline')}
            </Text>
            <Text style={[styles.infoValue, { textAlign: rtl ? 'right' : 'left', fontFamily: font.bold }]}>
              {formatDate(request.deadline)}
            </Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={[styles.infoLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left', fontFamily: font.regular }]}>
              {t('project_details.location')}
            </Text>
            <Text style={[styles.infoValue, { textAlign: rtl ? 'right' : 'left', fontFamily: font.bold }]} numberOfLines={1}>
              {request.location}
            </Text>
          </View>
        </View>

        {crewSummary ? (
          <Text style={[styles.crew, { color: colors.textSec, textAlign: rtl ? 'right' : 'left', fontFamily: font.regular }]}>
            {crewSummary}
          </Text>
        ) : null}

        {filledCount > 0 && (
          <TouchableOpacity onPress={toggleTeam} style={[styles.teamToggle, { alignSelf: rtl ? 'flex-end' : 'flex-start' }]} activeOpacity={0.7}>
            <Text style={[styles.teamToggleText, { fontFamily: font.semiBold }]}>
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
                    (f) => f.category === slot.category && f.subcategory === slot.subcategory
                  );
                  const member = team.find(
                    (m) => m.professionalId === filled?.professionalId && m.subcategory === slot.subcategory
                  );
                  return (
                    <View key={i} style={[styles.teamRow, { flexDirection: rowDir }]}>
                      <View style={styles.teamDot} />
                      <View style={styles.teamInfo}>
                        <Text style={[styles.teamRole, { color: '#004aad', textAlign: rtl ? 'right' : 'left', fontFamily: font.semiBold }]}>{slot.subcategory}</Text>
                        {member ? (
                          <Text style={[styles.teamName, { color: colors.textSec, textAlign: rtl ? 'right' : 'left', fontFamily: font.regular }]}>{member.displayName} · ${member.price.toLocaleString()}</Text>
                        ) : (
                          <Text style={[styles.teamOpen, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left', fontFamily: font.regular }]}>— Open</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        {!confirmDelete ? (
          <View style={[styles.btnRow, { borderTopColor: colors.border, flexDirection: rowDir }]}>
            {request.chatId ? (
              <TouchableOpacity
                style={styles.chatPill}
                onPress={() => router.push(`/${modeSegment}/(tabs)/chats/${request.chatId}` as never)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chatPillText, { fontFamily: font.semiBold }]}>{t('chats_page.open_chat')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.chatPill, styles.chatPillDisabled]}>
                <Text style={[styles.chatPillText, styles.chatPillTextDisabled, { fontFamily: font.semiBold }]}>{t('chats_page.no_chat_yet')}</Text>
              </View>
            )}
            {canEdit && (
              <>
                <TouchableOpacity style={styles.deletePill} onPress={() => setConfirmDelete(true)} activeOpacity={0.8}>
                  <Text style={[styles.deletePillText, { fontFamily: font.semiBold }]}>{t('chats_page.delete_project')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editPill} onPress={handleEdit} activeOpacity={0.8}>
                  <Text style={[styles.editPillText, { fontFamily: font.semiBold }]}>{t('chats_page.edit_project')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <View style={[styles.confirmRow, { borderTopColor: colors.border, backgroundColor: '#fef2f2' }]}>
            <Text style={[styles.confirmText, { textAlign: rtl ? 'right' : 'left', fontFamily: font.semiBold }]}>Delete this project?</Text>
            <View style={[styles.confirmBtns, { flexDirection: rowDir }]}>
              <TouchableOpacity style={styles.editPill} onPress={() => setConfirmDelete(false)} activeOpacity={0.8} disabled={isDeleting}>
                <Text style={[styles.editPillText, { fontFamily: font.semiBold }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deletePill} onPress={handleDelete} activeOpacity={0.8} disabled={isDeleting}>
                {isDeleting
                  ? <ActivityIndicator size="small" color="#ffffff" />
                  : <Text style={[styles.deletePillText, { fontFamily: font.semiBold }]}>Yes, Delete</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    position: 'relative',
    marginTop: 10,
    marginBottom: 16,
  },
  statusBadge: {
    position: 'absolute',
    top: -10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 2,
  },
  statusBadgeRight: { right: 12 },
  statusBadgeLeft: { left: 12 },
  statusBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  title: { fontSize: 16, marginBottom: 10 },
  infoRow: { justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  infoCol: { flex: 1 },
  infoLabel: { fontSize: 11, marginBottom: 2 },
  infoValue: { fontSize: 13, color: '#004aad' },
  crew: { fontSize: 13, marginBottom: 4 },
  teamToggle: { marginTop: 8 },
  teamToggleText: { fontSize: 13, color: '#cb6ce6', fontWeight: '600' },
  teamSection: { marginTop: 10, gap: 8 },
  teamRow: { alignItems: 'center', gap: 10 },
  teamDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#cb6ce6' },
  teamInfo: { flex: 1 },
  teamRole: { fontSize: 13, fontWeight: '600' },
  teamName: { fontSize: 12, marginTop: 1 },
  teamOpen: { fontSize: 12, marginTop: 1 },
  btnRow: {
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  chatPill: {
    backgroundColor: '#004aad',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chatPillDisabled: { backgroundColor: '#e0e0e0' },
  chatPillText: { color: '#ffffff', fontSize: 12 },
  chatPillTextDisabled: { color: '#9e9e9e' },
  deletePill: {
    backgroundColor: '#ff4d6d',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  deletePillText: { color: '#ffffff', fontSize: 12 },
  editPill: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  editPillText: { fontSize: 12, color: '#666666' },
  confirmRow: {
    marginTop: 12,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderRadius: 8,
    gap: 8,
  },
  confirmText: { fontSize: 13, fontWeight: '600', color: '#e53e3e' },
  confirmBtns: { justifyContent: 'flex-end', gap: 8 },
});

import { Modal, View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import {
  NON_SUBSCRIBER_SLOT_CAP,
  SUBSCRIBER_MONTHLY_LIMIT,
  SUB_PRICE_MONTHLY,
} from '@core/constants/pricing';
import type { ProjectRequest } from '@core/types/project';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    if (typeof result !== 'string') return key;
    if (!vars) return result;
    return result.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
  };
}

/**
 * Shown when a non-subscriber at the slot cap taps a noticeboard notice —
 * BEFORE the price offer is composed, so they never fill in a price only to be
 * rejected by `hireProfessional` with `slot-cap-reached`.
 *
 * Every number comes from the pricing config; none is written into a string.
 */
export function SlotBlockedSheet({
  visible,
  targetProject,
  occupied,
  onClose,
}: {
  visible: boolean;
  /** The notice they just tapped — named, so the sheet is about a decision
   *  rather than an abstract limit. */
  targetProject: ProjectRequest | null;
  /** The projects currently holding their slots, from `slotHolders`. */
  occupied: ProjectRequest[];
  onClose: () => void;
}) {
  const router = useRouter();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const align = rtl ? 'right' : 'left';

  const go = (href: string) => { onClose(); router.push(href as never); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <AppText weight="bold" style={[styles.title, { color: colors.text, textAlign: align }]}>
              {t('noticeboard.blocked_title')}
            </AppText>
            <AppText weight="regular" style={[styles.body, { color: colors.textMuted, textAlign: align }]}>
              {t('noticeboard.blocked_body', { project: targetProject?.title ?? '' })}
            </AppText>
            <AppText weight="semiBold" style={[styles.slotCount, { color: colors.textMuted, textAlign: align }]}>
              {t('noticeboard.blocked_slots', { used: occupied.length, cap: NON_SUBSCRIBER_SLOT_CAP })}
            </AppText>

            {/* Each occupied slot with the action that frees it. A completed
                project is settled; an active one is closed early (§5) — the
                same payment screen either way, and the chat stays open. */}
            {occupied.map((p) => {
              const isCompleted = p.status === 'completed';
              return (
                <View key={p.id} style={[styles.slotRow, { flexDirection: rowDir, borderColor: colors.border }]}>
                  <View style={styles.slotInfo}>
                    <AppText weight="semiBold" style={[styles.slotTitle, { color: colors.text, textAlign: align }]} numberOfLines={1}>
                      {p.title}
                    </AppText>
                    <AppText weight="regular" style={[styles.slotStatus, { color: colors.textMuted, textAlign: align }]}>
                      {isCompleted
                        ? t('noticeboard.blocked_status_completed')
                        : t('noticeboard.blocked_status_active')}
                    </AppText>
                  </View>
                  <TouchableOpacity
                    style={[styles.slotAction, { backgroundColor: isCompleted ? '#2d6a2d' : 'transparent', borderColor: '#2d6a2d' }]}
                    onPress={() => go(`/settings/payment?projectId=${p.id}`)}
                    activeOpacity={0.85}
                  >
                    <AppText weight="semiBold" style={[styles.slotActionText, { color: isCompleted ? '#ffffff' : '#2d6a2d' }]}>
                      {isCompleted
                        ? t('noticeboard.blocked_close')
                        : t('noticeboard.blocked_close_early')}
                    </AppText>
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* Pitch last: the way out that is not "pay now". */}
            <View style={[styles.pitch, { borderColor: colors.border }]}>
              <AppText weight="bold" style={[styles.pitchTitle, { color: colors.text, textAlign: align }]}>
                {t('noticeboard.blocked_pitch_title')}
              </AppText>
              <AppText weight="regular" style={[styles.pitchBody, { color: colors.textMuted, textAlign: align }]}>
                {t('noticeboard.blocked_pitch_body', {
                  limit: SUBSCRIBER_MONTHLY_LIMIT,
                  monthly: SUB_PRICE_MONTHLY,
                })}
              </AppText>
              <TouchableOpacity
                style={[styles.pitchCta, { backgroundColor: colors.primary }]}
                onPress={() => go('/settings/subscription')}
                activeOpacity={0.85}
              >
                <AppText weight="bold" style={styles.pitchCtaText}>
                  {t('noticeboard.blocked_pitch_cta')}
                </AppText>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.notNow} onPress={onClose} activeOpacity={0.7}>
              <AppText weight="regular" style={[styles.notNowText, { color: colors.textMuted }]}>
                {t('noticeboard.blocked_not_now')}
              </AppText>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, maxHeight: '85%' },
  title: { fontSize: 19, marginBottom: 6 },
  body: { fontSize: 14, marginBottom: 10, lineHeight: 20 },
  slotCount: { fontSize: 12, marginBottom: 12 },
  slotRow: {
    alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  slotInfo: { flex: 1, gap: 2 },
  slotTitle: { fontSize: 14 },
  slotStatus: { fontSize: 12 },
  slotAction: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  slotActionText: { fontSize: 13 },
  pitch: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 10, gap: 6 },
  pitchTitle: { fontSize: 15 },
  pitchBody: { fontSize: 13, lineHeight: 19 },
  pitchCta: { borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  pitchCtaText: { fontSize: 15, color: '#ffffff' },
  notNow: { alignItems: 'center', paddingVertical: 16 },
  notNowText: { fontSize: 14 },
});

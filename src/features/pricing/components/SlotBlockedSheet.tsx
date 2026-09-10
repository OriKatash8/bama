import { Modal, View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { usePricingConfig } from '../hooks/usePricingConfig';
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
 * Shown when a professional at the open-project cap taps a noticeboard notice —
 * BEFORE the price offer is composed, so they never fill in a price only to be
 * rejected by `hireProfessional` with `slot-cap-reached`.
 *
 * An EXPLAINER, with no way to buy past it. It used to offer two: settle the fee
 * on an occupied project, or take a subscription that lifted the cap. Both are
 * gone — a slot is freed by finishing or cancelling the work, and by nothing
 * else. The sheet's job is now to say which projects hold the slots.
 *
 * Every number comes from the runtime config; none is written into a string.
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
  const colors = useTheme();
  const pricing = usePricingConfig();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const align = rtl ? 'right' : 'left';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <AppText weight="bold" style={[styles.title, { color: colors.text, textAlign: align }]}>
              {t('noticeboard.blocked_title')}
            </AppText>
            <AppText weight="regular" style={[styles.body, { color: colors.textMuted, textAlign: align }]}>
              {t('noticeboard.blocked_body', { project: targetProject?.title ?? '' })}
            </AppText>
            <AppText weight="semiBold" style={[styles.slotCount, { color: colors.textMuted, textAlign: align }]}>
              {t('noticeboard.blocked_slots', { used: occupied.length, cap: pricing.maxOpenProjects })}
            </AppText>

            {/* Which projects hold the slots, and what state each is in. No
                action button: nothing on this sheet frees a slot, because
                nothing a professional can buy does. */}
            {occupied.map((p) => (
              <View key={p.id} style={[styles.slotRow, { flexDirection: rowDir }]}>
                <View style={styles.slotInfo}>
                  <AppText weight="semiBold" style={[styles.slotTitle, { color: colors.text, textAlign: align }]} numberOfLines={1}>
                    {p.title}
                  </AppText>
                  <AppText weight="regular" style={[styles.slotStatus, { color: colors.textMuted, textAlign: align }]}>
                    {p.status === 'completed'
                      ? t('noticeboard.blocked_status_completed')
                      : t('noticeboard.blocked_status_active')}
                  </AppText>
                </View>
              </View>
            ))}

            <AppText weight="regular" style={[styles.howBody, { color: colors.textMuted, textAlign: align }]}>
              {t('noticeboard.blocked_how')}
            </AppText>

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

// The app's card convention, hardcoded per screen rather than themed — see the
// note on `card` in src/core/hooks/useTheme.tsx for why the token is not used.
const CARD_BORDER = 'rgba(30,79,163,0.07)';
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '85%',
  },
  title: { fontSize: 19, marginBottom: 6 },
  body: { fontSize: 14, marginBottom: 10, lineHeight: 20 },
  slotCount: { fontSize: 12, marginBottom: 12 },
  slotRow: {
    alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16,
    borderColor: CARD_BORDER,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  slotInfo: { flex: 1, gap: 2 },
  slotTitle: { fontSize: 14 },
  slotStatus: { fontSize: 12 },
  howBody: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  notNow: { alignItems: 'center', paddingVertical: 16 },
  notNowText: { fontSize: 14 },
});

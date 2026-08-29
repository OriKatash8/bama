import { Modal, View, TouchableOpacity, StyleSheet } from 'react-native';
import { ShieldBan, ShieldAlert } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useModerationStore } from '@core/stores/moderationStore';
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

/**
 * Full-screen notice shown to a warned or suspended user. Rendered at the app
 * root (survives sign-out). A suspended user has already been signed out; a
 * warned user acknowledges and continues. Dismiss is local — the notice
 * reappears on next launch until an admin clears the state.
 */
export function ModerationGate() {
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(rtl ? he : en);
  const { notice, clearNotice } = useModerationStore();

  if (!notice) return null;

  const suspended = notice.status === 'suspended';
  const Icon = suspended ? ShieldBan : ShieldAlert;
  const accent = suspended ? '#e53935' : '#ff9800';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={clearNotice}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.iconWrap, { backgroundColor: accent + '18' }]}>
            <Icon size={34} color={accent} strokeWidth={2.2} />
          </View>
          <AppText weight="bold" style={[styles.title, { color: colors.text }]}>
            {t(suspended ? 'moderation.suspended_title' : 'moderation.warned_title')}
          </AppText>
          <AppText weight="regular" style={[styles.body, { color: colors.textSec, textAlign: 'center' }]}>
            {t(suspended ? 'moderation.suspended_body' : 'moderation.warned_body')}
          </AppText>

          <View style={[styles.reasonBox, { borderColor: accent + '55', backgroundColor: accent + '11' }]}>
            <AppText weight="semiBold" style={[styles.reasonLabel, { color: accent, textAlign: rtl ? 'right' : 'left' }]}>
              {t('moderation.reason_label')}
            </AppText>
            <AppText weight="regular" style={[styles.reasonText, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
              {notice.reason}
            </AppText>
          </View>

          {suspended && (
            <AppText weight="regular" style={[styles.appeal, { color: colors.textMuted, textAlign: 'center' }]}>
              {t('moderation.appeal_hint')}
            </AppText>
          )}

          <TouchableOpacity style={[styles.btn, { backgroundColor: accent }]} onPress={clearNotice} activeOpacity={0.85}>
            <AppText weight="semiBold" style={styles.btnText}>
              {t(suspended ? 'moderation.dismiss' : 'moderation.acknowledge')}
            </AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.6)' },
  card: { width: '100%', maxWidth: 400, borderRadius: 22, padding: 22, alignItems: 'center', gap: 12 },
  iconWrap: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20 },
  reasonBox: { width: '100%', borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  reasonLabel: { fontSize: 12 },
  reasonText: { fontSize: 15, lineHeight: 21 },
  appeal: { fontSize: 12, lineHeight: 17 },
  btn: { width: '100%', borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#ffffff', fontSize: 15 },
});

import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ban, Flag, Reply } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

const DANGER = '#C0392B';

/**
 * The menu behind a message long-press and the chat header's ⋯ button: the
 * labelled routes to Report and Block that App Store Guideline 1.2 asks for,
 * so neither lives only on a profile two screens away.
 *
 * `subject` is who the actions apply to; `reportKind` picks the wording
 * ("Report message" vs "Report user").
 */
export function ContentActionSheet({
  visible,
  subjectName,
  reportKind,
  onClose,
  onReply,
  onReport,
  onBlock,
}: {
  visible: boolean;
  subjectName: string;
  reportKind: 'message' | 'user';
  onClose: () => void;
  /** Absent in the header menu, where there is no message to reply to. */
  onReply?: () => void;
  onReport: () => void;
  onBlock: () => void;
}) {
  const rtl = useSettingsStore((s) => s.language) === 'he';
  const tr = (rtl ? he : en).moderation;
  const row = rtl ? 'row-reverse' : 'row';
  const align = rtl ? 'right' : 'left';

  function run(fn: () => void) {
    onClose();
    fn();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} testID="content-actions-backdrop" />
        <View style={styles.card} testID="content-actions">
          {!!subjectName && (
            <AppText weight="semiBold" style={[styles.title, { textAlign: align }]} numberOfLines={1}>
              {subjectName}
            </AppText>
          )}
          {onReply && (
            <TouchableOpacity
              style={[styles.item, { flexDirection: row }]}
              onPress={() => run(onReply)}
              accessibilityRole="button"
              testID="content-action-reply"
            >
              <Reply size={20} color="#000000" strokeWidth={2} />
              <AppText style={[styles.itemText, { textAlign: align }]}>{tr.reply}</AppText>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.item, { flexDirection: row }]}
            onPress={() => run(onReport)}
            accessibilityRole="button"
            testID="content-action-report"
          >
            <Flag size={20} color={DANGER} strokeWidth={2} />
            <AppText style={[styles.itemText, { color: DANGER, textAlign: align }]}>
              {reportKind === 'message' ? tr.report_message : tr.report_user}
            </AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.item, { flexDirection: row }]}
            onPress={() => run(onBlock)}
            accessibilityRole="button"
            testID="content-action-block"
          >
            <Ban size={20} color={DANGER} strokeWidth={2} />
            <AppText style={[styles.itemText, { color: DANGER, textAlign: align }]}>{tr.block_user}</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button" testID="content-action-cancel">
            <AppText weight="semiBold" style={styles.cancelText}>{tr.cancel}</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#ffffff', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 8 },
  title: { color: '#000000', fontSize: 14, paddingHorizontal: 14, paddingVertical: 8, opacity: 0.6 },
  item: { alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  itemText: { flex: 1, color: '#000000', fontSize: 16 },
  cancel: { alignItems: 'center', paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.12)', marginTop: 4 },
  cancelText: { color: '#004aad', fontSize: 16 },
});

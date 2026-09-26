import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import { useAuthStore } from '@core/stores/authStore';
import { useBlockStore } from '@core/stores/blockStore';
import { blockUser, unblockUser } from '../services/blockService';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

const DANGER = '#C0392B';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    let result: unknown = translations;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

/**
 * Confirm-and-block, shared by every entry point so the wording — and the
 * promise that the other person is not told — is identical everywhere.
 *
 * Deliberately a Modal and not Alert.alert: `Alert.alert` silently no-ops on
 * web, and BAMA is developed against localhost:8081. A confirmation that does
 * nothing on one platform is worse than no confirmation.
 */
export function BlockUserSheet({
  visible, onClose, targetUserId, targetName,
}: {
  visible: boolean;
  onClose: () => void;
  targetUserId: string;
  targetName: string;
}) {
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const textAlign = rtl ? 'right' : ('left' as const);
  const showToast = useUiStore((s) => s.showToast);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const blocked = useBlockStore((s) => s.blocked);
  const isBlocked = blocked.includes(targetUserId);

  async function apply() {
    if (!currentUserId) return;
    try {
      if (isBlocked) {
        await unblockUser(currentUserId, targetUserId);
        showToast(t('blocking.unblocked_toast'), 'success');
      } else {
        await blockUser(currentUserId, targetUserId);
        showToast(t('blocking.blocked_toast'), 'success');
      }
      onClose();
    } catch (e: any) {
      console.error('[block] failed:', e?.code, e?.message);
      showToast(t('blocking.failed'), 'error');
    }
  }

  const title = (isBlocked ? t('blocking.unblock_title') : t('blocking.confirm_title'))
    .replace('{{name}}', targetName);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <AppText weight="semiBold" style={[styles.title, { ...font.semiBold, textAlign }]}>
            {title}
          </AppText>
          <AppText style={[styles.body, { ...font.regular, textAlign }]}>
            {isBlocked ? t('blocking.unblock_body') : t('blocking.confirm_body')}
          </AppText>
          {!isBlocked && (
            <AppText style={[styles.note, { ...font.regular, textAlign }]}>
              {t('blocking.confirm_note_project')}
            </AppText>
          )}
          <View style={[styles.actions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn} accessibilityRole="button">
              <AppText style={[styles.cancelText, { ...font.regular }]}>
                {t('blocking.cancel')}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={apply}
              style={[styles.confirmBtn, isBlocked && styles.unblockBtn]}
              accessibilityRole="button"
              testID="block-confirm"
            >
              <AppText weight="semiBold" style={[styles.confirmText, { ...font.semiBold }]}>
                {isBlocked ? t('blocking.unblock') : t('blocking.block')}
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  card: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, gap: 10 },
  title: { fontSize: 17, color: '#000000' },
  body: { fontSize: 14, color: '#4A4A4F', lineHeight: 20 },
  note: { fontSize: 12.5, color: '#6B6B70', lineHeight: 18 },
  actions: { justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  cancelBtn: { paddingVertical: 11, paddingHorizontal: 18, borderRadius: 12 },
  cancelText: { fontSize: 14, color: '#4A4A4F' },
  confirmBtn: {
    backgroundColor: DANGER, paddingVertical: 11, paddingHorizontal: 20, borderRadius: 12,
  },
  unblockBtn: { backgroundColor: '#4A4A4F' },
  confirmText: { fontSize: 14, color: '#FFFFFF' },
});

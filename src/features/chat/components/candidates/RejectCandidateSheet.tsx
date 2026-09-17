import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useCandidateText } from './useCandidateText';
import { sheetStyles as s } from './sheetStyles';

/** Mirrors rejectCandidate's server cap, so the input stops where the callable truncates. */
export const REJECT_REASON_MAX = 500;

/**
 * לא רלוונטי. The sheet IS the confirmation — it states what happens (removed
 * from the chat and project, the role reopens) and that the reason is private —
 * so there is no second dialog on top of it.
 */
export function RejectCandidateSheet({
  visible,
  name,
  submitting,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  name: string;
  submitting: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  const { t, align } = useCandidateText();
  const [reason, setReason] = useState('');

  // A reason typed for one professional must not reappear for the next.
  useEffect(() => { if (!visible) setReason(''); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet} testID="reject-candidate-sheet">
          <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
            <AppText weight="bold" style={[s.title, { color: colors.text, textAlign: align }]}>
              {t('candidate_review.reject_title', { name })}
            </AppText>
            <AppText weight="regular" style={[s.body, { color: colors.textMuted, textAlign: align }]}>
              {t('candidate_review.reject_body', { name })}
            </AppText>
            <AppText weight="regular" style={[s.label, { color: colors.textMuted, textAlign: align }]}>
              {t('candidate_review.reject_reason_label')}
            </AppText>
            <TextInput
              testID="reject-reason-input"
              style={[s.input, s.multiline, {
                backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text, textAlign: align,
              }]}
              value={reason}
              onChangeText={setReason}
              maxLength={REJECT_REASON_MAX}
              multiline
              editable={!submitting}
              placeholder={t('candidate_review.reject_reason_placeholder')}
              placeholderTextColor={colors.textMuted}
            />
            <AppText weight="regular" style={[s.counter, { color: colors.textMuted, textAlign: align }]}>
              {`${reason.length}/${REJECT_REASON_MAX}`}
            </AppText>
            <TouchableOpacity
              testID="reject-confirm"
              style={[s.confirm, s.confirmDanger, submitting && s.confirmDisabled]}
              onPress={() => onConfirm(reason.trim())}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting }}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#ffffff" size="small" />
                : <AppText weight="bold" style={s.confirmText}>{t('candidate_review.reject_confirm')}</AppText>}
            </TouchableOpacity>
            <TouchableOpacity style={s.notNow} onPress={onClose} disabled={submitting} activeOpacity={0.7}>
              <AppText weight="regular" style={[s.notNowText, { color: colors.textMuted }]}>
                {t('candidate_review.cancel')}
              </AppText>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

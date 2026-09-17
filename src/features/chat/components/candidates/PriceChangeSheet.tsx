import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { MAX_OFFER_PRICE, MIN_OFFER_PRICE } from '@core/constants/pricing';
import type { ReviewRole } from '../../services/candidateService';
import { useCandidateText } from './useCandidateText';
import { sheetStyles as s } from './sheetStyles';

const NOTE_MAX = 500;

/** Same bounds as the server. Client-side only so the button can say no early. */
export function isProposedPriceValid(raw: string): boolean {
  const n = Number(raw.replace(/,/g, '').trim());
  return raw.trim() !== '' && Number.isFinite(n) && n >= MIN_OFFER_PRICE && n <= MAX_OFFER_PRICE;
}

/**
 * שינוי מחיר from the review card. A price change is per ROLE on the server, so
 * a professional hired for two roles makes the client pick one first; with a
 * single role it is preselected.
 */
export function PriceChangeSheet({
  visible,
  name,
  roles,
  submitting,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  name: string;
  roles: ReviewRole[];
  submitting: boolean;
  onSubmit: (role: ReviewRole, amount: number, note: string) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  const { t, align, money, dir } = useCandidateText();
  const [roleKey, setRoleKey] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setRoleKey(roles.length === 1 ? roles[0].key : null);
    } else {
      setRoleKey(null); setAmount(''); setNote('');
    }
    // Reset when opened for a (possibly different) professional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const role = roles.find((r) => r.key === roleKey) ?? null;
  const amountOk = isProposedPriceValid(amount);
  const canSend = !!role && amountOk && !submitting;
  const inputStyle = { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text, textAlign: align };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet} testID="price-change-sheet">
          <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
            <AppText weight="bold" style={[s.title, { color: colors.text, textAlign: align }, dir]}>
              {t('candidate_review.price_title', { name })}
            </AppText>

            {roles.length > 1 && (
              <AppText weight="regular" style={[s.label, { color: colors.textMuted, textAlign: align }]}>
                {t('candidate_review.price_role_label')}
              </AppText>
            )}
            {roles.map((r) => {
              const selected = r.key === roleKey;
              return (
                <TouchableOpacity
                  key={r.key}
                  testID={`price-role-${r.key}`}
                  style={[s.option, selected && s.optionSelected]}
                  onPress={() => setRoleKey(r.key)}
                  disabled={submitting || roles.length === 1}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  activeOpacity={0.8}
                >
                  <AppText weight="semiBold" style={{ fontSize: 14, color: selected ? '#004aad' : colors.text, textAlign: align }}>
                    {r.label}
                  </AppText>
                  <AppText weight="regular" style={{ fontSize: 12, color: colors.textMuted, textAlign: align }}>
                    {t('candidate_review.price_current', { price: money(r.amount) })}
                  </AppText>
                </TouchableOpacity>
              );
            })}

            <AppText weight="regular" style={[s.label, { color: colors.textMuted, textAlign: align }]}>
              {t('candidate_review.price_amount_label')}
            </AppText>
            <TextInput
              testID="price-amount-input"
              style={[s.input, inputStyle]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              editable={!submitting}
              placeholderTextColor={colors.textMuted}
            />
            {amount.trim() !== '' && !amountOk && (
              <AppText weight="regular" style={[s.error, { textAlign: align }]} testID="price-amount-error">
                {t('project_details.reprice_out_of_range')}
              </AppText>
            )}

            <AppText weight="regular" style={[s.label, { color: colors.textMuted, textAlign: align }]}>
              {t('candidate_review.price_note_label')}
            </AppText>
            <TextInput
              style={[s.input, s.multiline, inputStyle]}
              value={note}
              onChangeText={setNote}
              maxLength={NOTE_MAX}
              multiline
              editable={!submitting}
            />

            <TouchableOpacity
              testID="price-send"
              style={[s.confirm, !canSend && s.confirmDisabled]}
              onPress={() => role && canSend && onSubmit(role, Number(amount.replace(/,/g, '').trim()), note.trim())}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend }}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#ffffff" size="small" />
                : <AppText weight="bold" style={s.confirmText}>{t('candidate_review.price_send')}</AppText>}
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

import { useEffect, useState } from 'react';
import {
  Modal, View, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, TextInput,
} from 'react-native';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
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

export type ContestReason = 'didnt_happen' | 'amount_disputed';

/** The server's bound on free text that lands in a document an admin reads.
 *  Mirrored here so the input stops at the same place the callable truncates,
 *  rather than silently losing the tail. */
const NOTE_MAX = 1000;

/**
 * The professional contests their own completed engagement.
 *
 * TWO CHOICES, NEITHER PRESELECTED. They are not two wordings of one thing: one
 * voids the fee, the other holds it while an admin decides the number, and they
 * route to different admin queues. A default would hand the professional the
 * cheaper branch without them having chosen it — which is precisely what the
 * split exists to prevent — so the confirm button stays disabled until one is
 * picked, and the server rejects an absent reason rather than guessing.
 *
 * Each option states its own consequence next to it. Choosing between "it did
 * not happen" and "the amount is wrong" is only a real choice if what follows
 * from each is on screen.
 */
export function ContestEngagementSheet({
  visible,
  projectTitle,
  submitting,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  projectTitle: string;
  submitting: boolean;
  onConfirm: (reason: ContestReason, note: string) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const align = rtl ? 'right' : 'left';

  const [reason, setReason] = useState<ContestReason | null>(null);
  const [note, setNote] = useState('');

  // Reopening must not inherit the last choice. A sheet that remembers a
  // selection is a sheet with a default, one dismissal later.
  useEffect(() => {
    if (!visible) { setReason(null); setNote(''); }
  }, [visible]);

  const options: { key: ContestReason; label: string; consequence: string }[] = [
    {
      key: 'didnt_happen',
      label: t('engagement.contest_didnt_happen'),
      consequence: t('engagement.contest_didnt_happen_note'),
    },
    {
      key: 'amount_disputed',
      label: t('engagement.contest_amount'),
      consequence: t('engagement.contest_amount_note'),
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <AppText weight="bold" style={[styles.title, { color: colors.text, textAlign: align }]}>
              {t('engagement.contest_title')}
            </AppText>
            <AppText weight="regular" style={[styles.body, { color: colors.textMuted, textAlign: align }]}>
              {t('engagement.contest_body', { project: projectTitle })}
            </AppText>

            {options.map((o) => {
              const selected = reason === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => setReason(o.key)}
                  disabled={submitting}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <AppText
                    weight="semiBold"
                    style={[styles.optionLabel, { color: selected ? '#004aad' : colors.text, textAlign: align }]}
                  >
                    {o.label}
                  </AppText>
                  <AppText weight="regular" style={[styles.optionNote, { color: colors.textMuted, textAlign: align }]}>
                    {o.consequence}
                  </AppText>
                </TouchableOpacity>
              );
            })}

            <AppText weight="regular" style={[styles.noteLabel, { color: colors.textMuted, textAlign: align }]}>
              {t('engagement.contest_note_label')}
            </AppText>
            <TextInput
              style={[styles.noteInput, {
                backgroundColor: colors.inputBg, borderColor: colors.border,
                color: colors.text, textAlign: align,
              }]}
              value={note}
              onChangeText={setNote}
              maxLength={NOTE_MAX}
              multiline
              editable={!submitting}
              placeholder={t('engagement.contest_note_placeholder')}
              placeholderTextColor={colors.textMuted}
            />

            <TouchableOpacity
              // Disabled until a reason is chosen. The server refuses an absent
              // reason with invalid-argument; a button that fires anyway would
              // turn a deliberate refusal into a generic error toast.
              style={[styles.confirm, (!reason || submitting) && styles.confirmDisabled]}
              onPress={() => reason && onConfirm(reason, note.trim())}
              disabled={!reason || submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#ffffff" size="small" />
                : <AppText weight="bold" style={styles.confirmText}>
                    {t('engagement.contest_confirm')}
                  </AppText>}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notNow}
              onPress={onClose}
              disabled={submitting}
              activeOpacity={0.7}
            >
              <AppText weight="regular" style={[styles.notNowText, { color: colors.textMuted }]}>
                {t('engagement.contest_cancel')}
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
  body: { fontSize: 14, marginBottom: 14, lineHeight: 20 },
  option: {
    borderWidth: 1, borderRadius: 16, borderColor: CARD_BORDER,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, gap: 3,
  },
  optionSelected: { borderColor: '#004aad', backgroundColor: 'rgba(0,74,173,0.05)' },
  optionLabel: { fontSize: 14 },
  optionNote: { fontSize: 12, lineHeight: 17 },
  noteLabel: { fontSize: 12, marginTop: 6, marginBottom: 6 },
  noteInput: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, minHeight: 76, textAlignVertical: 'top',
  },
  confirm: {
    backgroundColor: '#004aad', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, marginTop: 14, minHeight: 50,
  },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { fontSize: 15, color: '#ffffff' },
  notNow: { alignItems: 'center', paddingVertical: 14 },
  notNowText: { fontSize: 14 },
});

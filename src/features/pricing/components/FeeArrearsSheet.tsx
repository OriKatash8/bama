import { Modal, View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import type { FeeArrears } from '../hooks/useFeeArrears';
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
 * Shown when a professional in arrears taps a noticeboard notice — before any
 * price is composed, the same moment SlotBlockedSheet works at.
 *
 * ACCOUNT STANDING, NOT A PRODUCT. There is no pay button, no price tag on the
 * action, and nothing here that could be read as a purchase, because a payment
 * must never unlock anything inside the app. What is withheld is the taking-on of
 * new real-world work, from someone already past the grace period on an invoice
 * that was actually sent to them. Nobody with a clean account can see this sheet.
 *
 * So it says three things and stops: what is owed, that a demand went out, and
 * how settlement happens (outside the app). It also names what stays open, since
 * a professional's instinct on seeing a block is that their account is suspended.
 * Never add a scale to it — "pay more, take more" is the exact shape that turns
 * this into a purchase.
 */
export function FeeArrearsSheet({
  visible,
  arrears,
  onClose,
}: {
  visible: boolean;
  arrears: FeeArrears;
  onClose: () => void;
}) {
  const colors = useTheme();
  const router = useRouter();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const align = rtl ? 'right' : 'left';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <AppText weight="bold" style={[styles.title, { color: colors.text, textAlign: align }]}>
              {t('noticeboard.arrears_title')}
            </AppText>

            <AppText weight="regular" style={[styles.body, { color: colors.text, textAlign: align }]}>
              {t('noticeboard.arrears_body', {
                amount: arrears.totalOwed.toLocaleString(),
                days: arrears.graceDays,
              })}
            </AppText>

            {/* Named explicitly: the block is narrow, and a professional who
                thinks their account is suspended behaves as if it were. */}
            <AppText weight="regular" style={[styles.keeps, { color: colors.textMuted, textAlign: align }]}>
              {t('noticeboard.arrears_keeps')}
            </AppText>

            <AppText weight="regular" style={[styles.howBody, { color: colors.textMuted, textAlign: align }]}>
              {t('noticeboard.arrears_how')}
            </AppText>

            {/* Through to the standing terms rather than restating the rate and
                minimum here — one description of the commission, not two. */}
            <TouchableOpacity
              style={styles.termsLink}
              onPress={() => { onClose(); router.push('/settings/pricing'); }}
              activeOpacity={0.7}
            >
              <AppText weight="semiBold" style={[styles.termsText, { color: colors.primary }]}>
                {t('noticeboard.arrears_terms')}
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.notNow} onPress={onClose} activeOpacity={0.7}>
              <AppText weight="regular" style={[styles.notNowText, { color: colors.textMuted }]}>
                {t('noticeboard.arrears_close')}
              </AppText>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// Matches SlotBlockedSheet, which this sits beside in the same flow.
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '85%',
  },
  title: { fontSize: 19, marginBottom: 8 },
  body: { fontSize: 14, marginBottom: 12, lineHeight: 20 },
  keeps: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  howBody: { fontSize: 13, lineHeight: 19 },
  termsLink: { paddingVertical: 14 },
  termsText: { fontSize: 14 },
  notNow: { alignItems: 'center', paddingVertical: 10 },
  notNowText: { fontSize: 14 },
});

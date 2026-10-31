import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { CreditCard } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import { useModeAccent } from '@core/navigation/floatingTabBar';
import { confirmDialog } from '@utils/confirmDialog';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import {
  createCardSaveSession, removeMyPaymentMethod, fakeCompleteCardSave, type PaymentMethodView,
} from '../services/paymentMethodService';

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

const BRANDS: Record<string, string> = {
  visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', isracard: 'Isracard', diners: 'Diners',
};

/** "MM/YY". */
export function formatExpiry(month?: number, year?: number): string {
  if (!month || !year) return '';
  return `${String(month).padStart(2, '0')}/${String(year % 100).padStart(2, '0')}`;
}

/**
 * The card a professional's brokerage fee ("עמלת תיווך") is charged to.
 *
 * Takes the state from usePaymentMethod (the screen also needs `enabled`). Rendered ONLY when the server says `enabled` for THIS user (getMyPaymentMethod
 * applies the same guard the charging code uses), so with payments off, or for a
 * user outside a test, it does not exist. A professional with no card can use
 * everything in the app; this is never a gate, only a place to add one.
 *
 * Card details are typed on the provider's hosted page in the system browser, never
 * in the app. The app sees last4 / brand / expiry and nothing else.
 */
export function PaymentMethodRow({ view, refresh }: { view: PaymentMethodView | null; refresh: () => Promise<void> }) {
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const align = rtl ? 'right' : ('left' as const);
  const colors = useTheme();
  const { accent } = useModeAccent();
  const showToast = useUiStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  // Unknown, or off for this user: render nothing at all.
  if (!view || view.enabled !== true) return null;

  async function addOrReplace() {
    if (busy) return;
    setBusy(true);
    try {
      const session = await createCardSaveSession({});
      if (session.sessionId.startsWith('fake_')) {
        // The test provider has no hosted page; complete the save directly.
        await fakeCompleteCardSave({ token: 'tok_ok' });
      } else {
        await WebBrowser.openAuthSessionAsync(session.url, Linking.createURL('/settings/payment'));
      }
      await refresh();
    } catch (err) {
      console.error('[paymentMethod] card save failed:', err);
      showToast(t('payment_method.save_failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    const ok = await confirmDialog(t('payment_method.title'), t('payment_method.confirm_remove'), {
      confirm: t('payment_method.remove'), cancel: t('payment_method.cancel'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeMyPaymentMethod({});
      showToast(t('payment_method.removed'), 'success');
      await refresh();
    } catch (err) {
      console.error('[paymentMethod] remove failed:', err);
      showToast(t('payment_method.remove_failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const invalid = view.hasCard && view.status === 'invalid';
  const brand = BRANDS[(view.brand ?? '').toLowerCase()] ?? view.brand ?? '';

  return (
    <View style={styles.card} testID="payment-method-row">
      <View style={[styles.head, { flexDirection: rowDir }]}>
        <CreditCard size={20} color={accent} strokeWidth={2} />
        <AppText weight="semiBold" style={[styles.title, { color: colors.text, textAlign: align }]}>
          {t('payment_method.title')}
        </AppText>
      </View>

      {view.hasCard ? (
        <>
          <AppText weight="regular" style={[styles.line, { color: colors.text, textAlign: align }]} testID="payment-method-card">
            {`•••• ${view.last4 ?? ''} · ${brand} · ${formatExpiry(view.expMonth, view.expYear)}`}
          </AppText>
          {invalid && (
            <AppText weight="semiBold" style={[styles.invalid, { textAlign: align }]} testID="payment-method-invalid">
              {t('payment_method.invalid')}
            </AppText>
          )}
        </>
      ) : (
        <AppText weight="regular" style={[styles.line, { color: colors.textMuted, textAlign: align }]} testID="payment-method-empty">
          {t('payment_method.none')}
        </AppText>
      )}

      <View style={[styles.actions, { flexDirection: rowDir }]}>
        {busy ? <ActivityIndicator color={accent} testID="payment-method-busy" /> : null}
        <TouchableOpacity
          onPress={addOrReplace}
          disabled={busy}
          accessibilityRole="button"
          style={[styles.button, { borderColor: accent }]}
          testID="payment-method-add"
        >
          <AppText weight="semiBold" style={{ color: accent }}>
            {t(view.hasCard ? 'payment_method.replace' : 'payment_method.add')}
          </AppText>
        </TouchableOpacity>
        {view.hasCard && (
          <TouchableOpacity
            onPress={remove}
            disabled={busy}
            accessibilityRole="button"
            style={[styles.button, { borderColor: colors.textMuted }]}
            testID="payment-method-remove"
          >
            <AppText weight="semiBold" style={{ color: colors.textMuted }}>
              {t('payment_method.remove')}
            </AppText>
          </TouchableOpacity>
        )}
      </View>

      <AppText weight="regular" style={[styles.note, { color: colors.textMuted, textAlign: align }]}>
        {t('payment_method.note')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 18, marginBottom: 12, gap: 8,
    borderWidth: 1, borderColor: 'rgba(30,79,163,0.07)',
  },
  head: { alignItems: 'center', gap: 8 },
  title: { fontSize: 15, flex: 1 },
  line: { fontSize: 14 },
  invalid: { fontSize: 12, color: '#8a6100' },
  actions: { alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  button: { borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  note: { fontSize: 12, lineHeight: 18 },
});

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { Input } from '@components/ui/Input';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import { callFunction } from '@core/firebase/functions';
import { useLogout } from '@features/auth/hooks/useLogout';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

const BLACK = '#000000';
const GREY = '#F2F2F5';
const DANGER = '#C0392B';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    let result: unknown = translations;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

type Blocker =
  | { kind: 'open_engagement'; projectId: string; status: string }
  | { kind: 'open_client_project'; projectId: string; hiredCount: number }
  | { kind: 'reserved_listing'; listingId: string; role: 'buyer' | 'seller' };

type DeletionStatus = {
  canDelete: boolean;
  blockers: Blocker[];
  outstandingFee: number;
  outstandingFeeProjects: number;
};

const getStatus = callFunction<Record<string, never>, DeletionStatus>('getAccountDeletionStatus');
const deleteAccount = callFunction<Record<string, never>, { ok: boolean }>('deleteMyAccount');

/**
 * Account deletion (Apple 5.1.1(v): an app that creates accounts must delete
 * them from inside the app).
 *
 * The screen is deliberately unhurried. It states what goes and what stays
 * BEFORE offering the button, because the thing people regret is not the
 * deletion they intended — it is discovering afterwards that something they
 * cared about went with it.
 *
 * An unpaid platform fee warns but does not block: BAMA's fees are invoiced
 * outside the app, so blocking would leave that user permanently unable to
 * delete. See functions/src/account/deletion.ts for the full reasoning.
 *
 * The typed confirmation is not theatre. A single destructive button next to a
 * back arrow gets pressed by accident; a word does not get typed by accident.
 */
export default function DeleteAccountSettings() {
  const router = useRouter();
  const colors = useTheme();
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const textAlign = rtl ? 'right' : ('left' as const);
  const showToast = useUiStore((s) => s.showToast);
  const { logout } = useLogout();

  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStatus({})
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch((e) => {
        console.error('[deleteAccount] status failed:', e?.code, e?.message);
        if (!cancelled) showToast(t('delete_account.failed'), 'error');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmWord = t('delete_account.confirm_word');
  const armed = status?.canDelete === true
    && confirmText.trim().toUpperCase() === confirmWord.toUpperCase();

  async function onDelete() {
    if (!armed || deleting) return;
    setDeleting(true);
    try {
      await deleteAccount({});
      showToast(t('delete_account.done'), 'success');
      // The Auth user is gone. Sign out AND go to the log-in screen: the auth
      // listener (useAuth) only clears the store on sign-out — it does not
      // navigate — and this route sits outside the app groups, so without the
      // replace the user stayed on this screen of an account that no longer
      // exists. useLogout signs out, drops any saved deep link and replaces to
      // /(auth). Its push-token delete fails quietly now the user is gone; the
      // server already removed their tokens.
      await logout();
    } catch (e: any) {
      console.error('[deleteAccount] failed:', e?.code, e?.message, e?.details);
      showToast(t('delete_account.failed'), 'error');
      setDeleting(false);
    }
  }

  function blockerLabel(b: Blocker): string {
    if (b.kind === 'open_engagement') return t('delete_account.blocker_engagement');
    if (b.kind === 'open_client_project') return t('delete_account.blocker_client_project');
    return t('delete_account.blocker_listing');
  }

  const Chevron = rtl ? ChevronRight : ChevronLeft;

  return (
    <Screen backgroundColor="#FFFFFF">
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Chevron size={26} color={BLACK} />
        </TouchableOpacity>
        <AppText weight="semiBold" style={[styles.title, { ...font.semiBold }]}>
          {t('delete_account.title')}
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.textSec} /></View>
      ) : (
        <View style={styles.body}>
          <AppText style={[styles.intro, { ...font.regular, textAlign }]}>
            {t('delete_account.intro')}
          </AppText>

          <View style={styles.card}>
            <AppText weight="semiBold" style={[styles.cardTitle, { ...font.semiBold, textAlign }]}>
              {t('delete_account.what_goes_title')}
            </AppText>
            <AppText style={[styles.cardBody, { ...font.regular, textAlign }]}>
              {t('delete_account.what_goes')}
            </AppText>
          </View>

          <View style={styles.card}>
            <AppText weight="semiBold" style={[styles.cardTitle, { ...font.semiBold, textAlign }]}>
              {t('delete_account.what_stays_title')}
            </AppText>
            <AppText style={[styles.cardBody, { ...font.regular, textAlign }]}>
              {t('delete_account.what_stays')}
            </AppText>
          </View>

          {status && status.outstandingFee > 0 && (
            <View style={[styles.card, styles.warnCard]}>
              <View style={[styles.warnHead, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <TriangleAlert size={18} color={DANGER} />
                <AppText weight="semiBold" style={[styles.warnTitle, { ...font.semiBold }]}>
                  {t('delete_account.fee_title')}
                </AppText>
              </View>
              <AppText style={[styles.cardBody, { ...font.regular, textAlign }]}>
                {t('delete_account.fee_body')
                  .replace('{{amount}}', String(status.outstandingFee))
                  .replace('{{count}}', String(status.outstandingFeeProjects))}
              </AppText>
            </View>
          )}

          {status && !status.canDelete && (
            <View style={[styles.card, styles.blockCard]}>
              <AppText weight="semiBold" style={[styles.cardTitle, { ...font.semiBold, textAlign }]}>
                {t('delete_account.blocked_title')}
              </AppText>
              <AppText style={[styles.cardBody, { ...font.regular, textAlign }]}>
                {t('delete_account.blocked_intro')}
              </AppText>
              {status.blockers.map((b, i) => (
                <AppText
                  key={`${b.kind}-${i}`}
                  style={[styles.blockerRow, { ...font.regular, textAlign }]}
                >
                  {`• ${blockerLabel(b)}`}
                </AppText>
              ))}
            </View>
          )}

          {status?.canDelete && (
            <>
              <AppText style={[styles.confirmLabel, { ...font.regular, textAlign }]}>
                {t('delete_account.confirm_label')}
              </AppText>
              <Input
                testID="delete-confirm-input"
                value={confirmText}
                onChangeText={setConfirmText}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!deleting}
              />
              <TouchableOpacity
                onPress={onDelete}
                disabled={!armed || deleting}
                accessibilityRole="button"
                style={[styles.deleteBtn, (!armed || deleting) && styles.deleteBtnOff]}
              >
                <AppText weight="semiBold" style={[styles.deleteBtnText, { ...font.semiBold }]}>
                  {deleting ? t('delete_account.deleting') : t('delete_account.confirm_button')}
                </AppText>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
  },
  title: { fontSize: 18, color: BLACK },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, gap: 14 },
  intro: { fontSize: 15, color: BLACK, lineHeight: 21 },
  card: { backgroundColor: GREY, borderRadius: 14, padding: 14, gap: 6 },
  cardTitle: { fontSize: 15, color: BLACK },
  cardBody: { fontSize: 13, color: '#4A4A4F', lineHeight: 19 },
  warnCard: { backgroundColor: '#FDEDEA' },
  warnHead: { alignItems: 'center', gap: 8 },
  warnTitle: { fontSize: 15, color: DANGER },
  blockCard: { backgroundColor: '#FFF6E5' },
  blockerRow: { fontSize: 13, color: '#4A4A4F', lineHeight: 20 },
  confirmLabel: { fontSize: 13, color: '#4A4A4F', marginTop: 4 },
  deleteBtn: {
    backgroundColor: DANGER, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  deleteBtnOff: { opacity: 0.4 },
  deleteBtnText: { fontSize: 15, color: '#FFFFFF' },
});

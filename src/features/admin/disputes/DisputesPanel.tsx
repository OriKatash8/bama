import { useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { TextInput } from '@components/ui/Text';
import { callFunction } from '@core/firebase/functions';
import { useUiStore } from '@core/stores/uiStore';
import { confirmDialog } from '@utils/confirmDialog';
import { MIN_OFFER_PRICE, MAX_OFFER_PRICE } from '@core/constants/pricing';
import {
  AdminText, Card, CardHead, EmptyState, PillButton, RADIUS, SPACE, TYPE, useAdminPalette, useScopedT,
} from '@features/admin/ui';
import { HeldReviewNote } from './HeldReviewNote';
import type { AdminDispute } from './useAdminDisputes';

/** The SAME callable the Fees screen's dispute card uses: no second resolution path. */
const resolveFeeDispute = callFunction<
  { projectId: string; proId: string; outcome: 'completed' | 'cancelled'; agreedAmount?: number },
  { ok: boolean; outcome: string; feeDue: number }
>('resolveFeeDispute');

/** The corrected price typed, or undefined for none, NaN for not a number. */
function parseAgreed(raw: string | undefined): number | undefined {
  const trimmed = (raw ?? '').replace(/[,\s₪]/g, '');
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
}

function formatDate(ms: number | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Open disputes as report-style cards. Resolution is `resolveFeeDispute`, exactly
 * as on Admin → Fees; this panel invents no logic of its own.
 *
 * Only OPEN disputes exist here: resolving one clears its review flag, which is
 * also what removes it from the list, so there is no resolved state to show.
 */
export function DisputesPanel({
  disputes, state, onReload,
}: {
  disputes: AdminDispute[];
  state: 'loading' | 'ok' | 'error';
  onReload: () => Promise<void> | void;
}) {
  const p = useAdminPalette();
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const { t, rowDir, textAlign } = useScopedT('admin_reports');
  const { t: tf } = useScopedT('admin_fees');
  const { t: tCommon } = useScopedT('common');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [agreed, setAgreed] = useState<Record<string, string>>({});

  async function act(key: string, prompt: string, run: () => Promise<unknown>) {
    if (busy[key]) return;
    // confirmDialog, not Alert.alert: the latter no-ops on web, where admin runs.
    const ok = await confirmDialog(t('disputes_title'), prompt, {
      confirm: tCommon('confirm'), cancel: tCommon('cancel'),
    });
    if (!ok) return;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await run();
      showToast(tf('resolve_done'), 'success');
      await onReload();
    } catch (e) {
      showToast((e as { message?: string })?.message ?? tf('action_failed'), 'error');
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  if (state === 'loading') {
    return <ActivityIndicator size="large" color={p.accent} style={styles.spinner} testID="disputes-loading" />;
  }
  if (state === 'error') {
    return (
      <Card testID="disputes-error">
        <View style={styles.errorBody}>
          <AdminText weight="semiBold" style={[TYPE.rowName, { textAlign }]}>{tf('load_failed_title')}</AdminText>
          <AdminText style={[styles.body, { color: p.text2, textAlign }]}>{t('disputes_load_failed')}</AdminText>
          <View style={[styles.actions, { flexDirection: rowDir }]}>
            <PillButton variant="primary" label={tf('retry')} onPress={() => void onReload()} testID="disputes-retry" />
          </View>
        </View>
      </Card>
    );
  }
  if (disputes.length === 0) {
    return (
      <Card testID="disputes-empty">
        <EmptyState text={t('disputes_empty')} />
      </Card>
    );
  }

  return (
    <>
      {disputes.map((d) => {
        const key = `${d.projectId}:${d.proId}`;
        const isBusy = busy[key] === true;
        const price = parseAgreed(agreed[key]);
        function resolveCompleted() {
          if (price !== undefined && !(price >= MIN_OFFER_PRICE && price <= MAX_OFFER_PRICE)) {
            showToast(tf('agreed_invalid', {
              min: MIN_OFFER_PRICE.toLocaleString(), max: MAX_OFFER_PRICE.toLocaleString(),
            }), 'error');
            return;
          }
          void act(
            key,
            price === undefined
              ? tf('confirm_resolve_completed', { amount: d.feeDueIfCompleted.toLocaleString() })
              : tf('confirm_resolve_completed_price', { price: price.toLocaleString() }),
            () => resolveFeeDispute({
              projectId: d.projectId, proId: d.proId, outcome: 'completed',
              ...(price === undefined ? {} : { agreedAmount: price }),
            }),
          );
        }
        return (
          <Card key={key} testID={`dispute-card-${key}`}>
            <CardHead
              title={d.title || d.projectId}
              sub={t('dispute_submitted', { date: formatDate(d.submittedAt) })}
              side={(
                <View style={[styles.chip, { backgroundColor: p.warnBg }]} testID={`dispute-status-${key}`}>
                  <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.chip, { color: p.warn }]}>
                    {t('dispute_status_open')}
                  </AdminText>
                </View>
              )}
            />
            <View style={[styles.cardBody, { borderTopColor: p.border }]}>
              <AdminText weight="semiBold" style={[TYPE.rowMeta, { color: p.bad, textAlign }]} testID={`dispute-type-${key}`}>
                {d.reason ? tf(`reason_${d.reason}`) : '—'}
              </AdminText>
              <AdminText style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>
                {tf('pro_label', { name: d.proName || d.proId })}
              </AdminText>
              <AdminText style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>
                {tf('client_label', { name: d.clientName || '—' })}
              </AdminText>
              <AdminText tabular style={[TYPE.rowMeta, { color: p.text2, textAlign }]} testID={`dispute-fee-${key}`}>
                {tf('dispute_fee_if_completed', { amount: d.feeDueIfCompleted.toLocaleString() })}
              </AdminText>

              <View style={[styles.note, { backgroundColor: p.surface2 }]}>
                <AdminText weight="semiBold" style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
                  {t('dispute_reason_label')}
                </AdminText>
                <AdminText selectable style={[styles.body, { color: p.text2, textAlign }]} testID={`dispute-note-${key}`}>
                  {d.note || t('dispute_no_reason')}
                </AdminText>
              </View>

              <HeldReviewNote review={d.heldReview} testID={`held-review-${key}`} />

              <TextInput
                testID={`agreed-${key}`}
                value={agreed[key] ?? ''}
                onChangeText={(v) => setAgreed((a) => ({ ...a, [key]: v }))}
                placeholder={tf('agreed_placeholder')}
                placeholderTextColor={p.text3}
                keyboardType="numeric"
                editable={!isBusy}
                style={[styles.agreedInput, { borderColor: p.border, color: p.text, textAlign }]}
              />

              <View style={[styles.actions, { flexDirection: rowDir }]}>
                {isBusy ? <ActivityIndicator size="small" color={p.accent} testID={`busy-${key}`} /> : null}
                <PillButton
                  variant="primary"
                  label={tf('resolve_completed')}
                  disabled={isBusy}
                  testID={`resolve-completed-${key}`}
                  onPress={resolveCompleted}
                />
                <PillButton
                  label={tf('resolve_cancelled')}
                  disabled={isBusy}
                  testID={`resolve-cancelled-${key}`}
                  onPress={() => act(
                    key,
                    tf('confirm_resolve_cancelled'),
                    () => resolveFeeDispute({ projectId: d.projectId, proId: d.proId, outcome: 'cancelled' }),
                  )}
                />
                {/* The admin's project view IS the project's chat (admin/projects opens it
                    the same way); there is no separate admin project page. */}
                {d.chatId ? (
                  <PillButton
                    label={t('dispute_open_chat')}
                    testID={`open-chat-${key}`}
                    onPress={() => router.push(`/admin/project-chat?chatId=${d.chatId}&projectId=${d.projectId}` as never)}
                  />
                ) : null}
              </View>
            </View>
          </Card>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  spinner: { marginTop: 40 },
  errorBody: { padding: SPACE.cardPad, gap: 10 },
  chip: { borderRadius: RADIUS.pill, paddingVertical: 3, paddingHorizontal: 9, flexShrink: 0 },
  cardBody: { borderTopWidth: 1, paddingVertical: 14, paddingHorizontal: SPACE.rowPadH, gap: 8 },
  body: { fontSize: 14, lineHeight: 21 },
  note: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, gap: 2 },
  agreedInput: { borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, fontSize: 14, lineHeight: 21 },
  actions: { alignItems: 'center', flexWrap: 'wrap', gap: 8 },
});

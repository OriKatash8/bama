import { useState } from 'react';
import { Modal, View, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { increment, serverTimestamp } from 'firebase/firestore';
import { MessagesSquare, FolderClosed, RotateCcw, Pencil, Check, X } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { EmptyState } from '@components/ui/EmptyState';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import { updateDocument } from '@core/firebase/firestore';
import { categoryLabel } from '@features/crew/data/categories';
import { useSentOffers, type SentOfferEntry } from '@features/offers/hooks/useSentOffers';
import { useHiddenProjects } from '@features/noticeboard/hooks/useHiddenProjects';
import type { PriceOffer, BundleOffer } from '@core/types/project';
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

type Tab = 'sent' | 'hidden';

// Status text colours reuse existing app values (no new palette).
const STATUS_COLOR: Record<string, string> = {
  pending: '#004aad',
  accepted: '#1c9d63',
  rejected: '#e53935',
  removed: 'rgba(15,15,31,0.4)',
};

export function NoticeHistorySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const { showToast } = useUiStore();

  const [tab, setTab] = useState<Tab>('sent');
  const { offers, loading: offersLoading } = useSentOffers();
  const { projects: hidden, loading: hiddenLoading, restore } = useHiddenProjects(visible);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  function formatDate(ts: number): string {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleDateString(rtl ? 'he-IL' : 'en-US', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  /** Individual offers reprice `priceOffers.price`; bundles reprice
   *  `bundleOffers.bundlePrice` — the same field the payment-request flow
   *  reprices a bundle on. `individualTotal` stays as the original
   *  per-slot sum, so it keeps working as the discount anchor. */
  async function saveEdit(entry: SentOfferEntry) {
    const price = Number(editValue);
    if (!Number.isFinite(price) || price <= 0) { showToast(t('history.invalid_price'), 'error'); return; }
    setSavingId(entry.id);
    try {
      const path = entry.kind === 'bundle' ? `bundleOffers/${entry.id}` : `priceOffers/${entry.id}`;
      const priceField = entry.kind === 'bundle' ? { bundlePrice: price } : { price };
      await updateDocument(path, { ...priceField, editedAt: serverTimestamp(), editCount: increment(1) } as never);
      setEditingId(null);
    } catch {
      showToast(t('history.save_error'), 'error');
    } finally {
      setSavingId(null);
    }
  }

  function offerCard(entry: SentOfferEntry) {
    const isPrice = entry.kind === 'price';
    const status = entry.data.status;
    const readOnly = status !== 'pending';
    const editable = status === 'pending';
    const editing = editingId === entry.id;
    const currentPrice = isPrice ? (entry.data as PriceOffer).price : (entry.data as BundleOffer).bundlePrice;
    const meta = isPrice
      ? `${categoryLabel((entry.data as PriceOffer).category, lang)} · ₪${currentPrice.toLocaleString()}`
      : `${t('history.bundle')} · ₪${currentPrice.toLocaleString()}`;
    const edited = !!entry.data.editedAt;

    return (
      <View key={`${entry.kind}-${entry.id}`} style={[styles.card, { borderColor: colors.border }, readOnly && styles.cardDim]}>
        <View style={[styles.cardTop, { flexDirection: rowDir }]}>
          <AppText weight="bold" numberOfLines={1} style={[styles.cardTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
            {entry.projectTitle ?? t('history.project_unavailable')}
          </AppText>
          <View style={[styles.statusBadge, { backgroundColor: colors.inputBg }]}>
            <AppText weight="semiBold" style={[styles.statusText, { color: STATUS_COLOR[status] ?? colors.textMuted }]}>
              {t(`history.status_${status}`)}
            </AppText>
          </View>
        </View>

        <AppText weight="regular" style={[styles.cardMeta, { color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]}>
          {meta}
        </AppText>
        {!isPrice && (
          <AppText weight="regular" style={[styles.bundleNote, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {t('history.bundle_note', { total: (entry.data as BundleOffer).individualTotal.toLocaleString() })}
          </AppText>
        )}

        <View style={[styles.cardBottom, { flexDirection: rowDir }]}>
          <AppText weight="regular" style={[styles.timeText, { color: colors.textMuted }]}>
            {edited ? t('history.edited') : formatDate(entry.ts)}
          </AppText>
          {editable && !editing && (
            <TouchableOpacity
              style={[styles.editBtn, { flexDirection: rowDir }]}
              onPress={() => { setEditingId(entry.id); setEditValue(String(currentPrice)); }}
              accessibilityRole="button"
              accessibilityLabel={t('history.edit_price')}
              activeOpacity={0.7}
            >
              <Pencil size={14} color={colors.primary} strokeWidth={2} />
              <AppText weight="semiBold" style={[styles.editText, { color: colors.primary }]}>{t('history.edit')}</AppText>
            </TouchableOpacity>
          )}
        </View>

        {editing && (
          <View style={[styles.editRow, { flexDirection: rowDir }]}>
            <TextInput
              style={[styles.priceInput, { borderColor: colors.border, color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
              value={editValue}
              onChangeText={setEditValue}
              keyboardType="numeric"
              placeholder="₪"
              placeholderTextColor={colors.placeholder}
            />
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.primary }]} onPress={() => saveEdit(entry)} disabled={savingId === entry.id} accessibilityRole="button" accessibilityLabel={t('history.save')}>
              {savingId === entry.id ? <ActivityIndicator size="small" color="#ffffff" /> : <Check size={16} color="#ffffff" strokeWidth={2.5} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtnGhost} onPress={() => setEditingId(null)} accessibilityRole="button" accessibilityLabel={t('history.cancel')}>
              <X size={16} color={colors.textMuted} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.sheet}>
          <AppText weight="bold" style={[styles.sheetTitle, { color: colors.primary, textAlign: rtl ? 'right' : 'left' }]}>
            {t('history.title')}
          </AppText>

          {/* Tab switcher (pill pair) */}
          <View style={[styles.tabs, { flexDirection: rowDir }]}>
            {(['sent', 'hidden'] as Tab[]).map((k) => {
              const active = tab === k;
              return (
                <TouchableOpacity key={k} style={[styles.tab, active ? styles.tabActive : styles.tabInactive]} onPress={() => setTab(k)} activeOpacity={0.85}>
                  <AppText weight="semiBold" style={[styles.tabText, { color: active ? '#ffffff' : colors.primary }]}>
                    {t(k === 'sent' ? 'history.tab_sent' : 'history.tab_hidden')}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.body}>
            {tab === 'sent' ? (
              offersLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
              ) : offers.length === 0 ? (
                <EmptyState
                  icon={MessagesSquare}
                  title={t('history.empty_sent_title')}
                  description={t('history.empty_sent_desc')}
                  primaryAction={{ label: t('history.close'), onPress: onClose }}
                  style={styles.emptyMin}
                />
              ) : (
                offers.map(offerCard)
              )
            ) : hiddenLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            ) : hidden.length === 0 ? (
              <EmptyState
                icon={FolderClosed}
                title={t('history.empty_hidden_title')}
                description={t('history.empty_hidden_desc')}
                primaryAction={{ label: t('history.close'), onPress: onClose }}
                style={styles.emptyMin}
              />
            ) : (
              hidden.map((p) => (
                <View key={p.id} style={[styles.hiddenRow, { flexDirection: rowDir, borderBottomColor: colors.border }]}>
                  <AppText weight="semiBold" numberOfLines={1} style={[styles.hiddenTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                    {p.title}
                  </AppText>
                  <TouchableOpacity
                    style={[styles.restoreBtn, { borderColor: colors.primary, flexDirection: rowDir }]}
                    onPress={() => restore(p.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('history.restore')}
                    activeOpacity={0.8}
                  >
                    <RotateCcw size={14} color={colors.primary} strokeWidth={2} />
                    <AppText weight="semiBold" style={[styles.restoreText, { color: colors.primary }]}>{t('history.restore')}</AppText>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { width: '100%', maxWidth: 440, maxHeight: '85%', backgroundColor: '#ffffff', borderRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  sheetTitle: { fontSize: 18, marginBottom: 12 },

  tabs: { gap: 8, marginBottom: 12 },
  tab: { flex: 1, borderRadius: 16, paddingVertical: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#004aad' },
  tabInactive: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#004aad' },
  tabText: { fontSize: 13 },

  body: { flexShrink: 1 },
  emptyMin: { minHeight: 240 },

  card: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10, gap: 4 },
  cardDim: { opacity: 0.6 },
  cardTop: { alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11 },
  cardMeta: { fontSize: 13 },
  bundleNote: { fontSize: 11 },
  cardBottom: { alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  timeText: { fontSize: 11 },
  editBtn: { alignItems: 'center', gap: 4 },
  editText: { fontSize: 12 },
  editRow: { alignItems: 'center', gap: 8, marginTop: 8 },
  priceInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  iconBtn: { width: 40, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconBtnGhost: { width: 40, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  hiddenRow: { alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  hiddenTitle: { flex: 1, fontSize: 14 },
  restoreBtn: { alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
  restoreText: { fontSize: 12 },
});

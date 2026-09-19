import { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { increment, serverTimestamp } from 'firebase/firestore';
import { Pencil, Check, X } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import { updateDocument } from '@core/firebase/firestore';
import { categoryLabel } from '@features/crew/data/categories';
import type { SentOfferEntry } from '@features/offers/hooks/useSentOffers';
import type { PosterInfo } from '@features/noticeboard/hooks/useNoticeboard';
import { NoticeBoardCard } from './NoticeBoardCard';
import type { PriceOffer, BundleOffer, ProjectRequest } from '@core/types/project';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { MIN_OFFER_PRICE, MAX_OFFER_PRICE } from '@core/constants/pricing';

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

type Tab = 'hidden' | 'sent';

// Status text colours reuse existing app values (no new palette).
const STATUS_COLOR: Record<string, string> = {
  pending: '#1D4ED8',
  accepted: '#1c9d63',
  rejected: '#e53935',
  removed: 'rgba(15,15,31,0.4)',
};

type Props = {
  offers: SentOfferEntry[];
  offersLoading: boolean;
  /** Hidden notices that can still be restored (useHiddenProjects). */
  hidden: ProjectRequest[];
  hiddenLoading: boolean;
  onRestore: (projectId: string) => void;
  onOpenProject: (project: ProjectRequest) => void;
  posters: Record<string, PosterInfo>;
  cardWidth: number;
};

/**
 * The noticeboard's History, in the page: two tab pills (hidden notices, sent
 * offers) above a vertical list that scrolls with the board's own ScrollView.
 *
 * Hidden notices are the board's own cards with Restore instead of Make offer.
 * Sent offers show their status, and a pending one can still be repriced: an
 * individual offer through `priceOffers.price`, a bundle through
 * `bundleOffers.bundlePrice` (the field the payment-request flow reprices a bundle
 * on; `individualTotal` stays the original sum, the discount anchor).
 */
export function NoticeHistoryView({
  offers, offersLoading, hidden, hiddenLoading, onRestore, onOpenProject, posters, cardWidth,
}: Props) {
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const textAlign = rtl ? 'right' : 'left';
  const { showToast } = useUiStore();

  // Open where the attention is: a pending offer (what the button's badge counts),
  // otherwise hidden notices if there are any.
  const [tab, setTab] = useState<Tab>(() => {
    if (offers.some((o) => o.data.status === 'pending')) return 'sent';
    return hidden.length > 0 ? 'hidden' : 'sent';
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  function formatDate(ts: number): string {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleDateString(rtl ? 'he-IL' : 'en-US', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  async function saveEdit(entry: SentOfferEntry) {
    const price = Number(editValue);
    if (!Number.isFinite(price) || price <= 0) { showToast(t('history.invalid_price'), 'error'); return; }
    if (price < MIN_OFFER_PRICE || price > MAX_OFFER_PRICE) {
      showToast(t('noticeboard.price_out_of_range', { min: MIN_OFFER_PRICE.toLocaleString(), max: MAX_OFFER_PRICE.toLocaleString() }), 'error');
      return;
    }
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
    const editable = status === 'pending';
    const editing = editingId === entry.id;
    const currentPrice = isPrice ? (entry.data as PriceOffer).price : (entry.data as BundleOffer).bundlePrice;
    const meta = isPrice
      ? `${categoryLabel((entry.data as PriceOffer).category, lang)} · ₪${currentPrice.toLocaleString()}`
      : `${t('history.bundle')} · ₪${currentPrice.toLocaleString()}`;
    const edited = !!entry.data.editedAt;

    return (
      <View key={`${entry.kind}-${entry.id}`} style={[styles.offerCard, { borderColor: colors.border, width: cardWidth }, !editable && styles.offerCardDim]}>
        <View style={[styles.offerTop, { flexDirection: rowDir }]}>
          <AppText weight="bold" numberOfLines={2} style={[styles.offerTitle, { textAlign }]}>
            {entry.projectTitle ?? t('history.project_unavailable')}
          </AppText>
          <View style={[styles.statusBadge, { backgroundColor: colors.inputBg }]}>
            <AppText weight="semiBold" style={[styles.statusText, { color: STATUS_COLOR[status] ?? colors.textMuted }]}>
              {t(`history.status_${status}`)}
            </AppText>
          </View>
        </View>

        <AppText weight="regular" style={[styles.offerMeta, { color: '#000000', textAlign }]}>{meta}</AppText>
        {!isPrice && (
          <AppText weight="regular" style={[styles.bundleNote, { color: '#000000', textAlign }]}>
            {t('history.bundle_note', { total: (entry.data as BundleOffer).individualTotal.toLocaleString() })}
          </AppText>
        )}

        <View style={[styles.offerBottom, { flexDirection: rowDir }]}>
          <AppText weight="regular" style={[styles.timeText, { color: '#000000' }]}>
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
              <Pencil size={14} color="#ffffff" strokeWidth={2} />
              <AppText weight="semiBold" style={styles.editText}>{t('history.edit')}</AppText>
            </TouchableOpacity>
          )}
        </View>

        {editing && (
          <View style={[styles.editRow, { flexDirection: rowDir }]}>
            <TextInput
              style={[styles.priceInput, { borderColor: '#1D4ED8', color: '#000000', textAlign }]}
              value={editValue}
              onChangeText={setEditValue}
              keyboardType="numeric"
              placeholder="₪"
              placeholderTextColor={colors.placeholder}
            />
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => saveEdit(entry)}
              disabled={savingId === entry.id}
              accessibilityRole="button"
              accessibilityLabel={t('history.save')}
            >
              {savingId === entry.id ? <ActivityIndicator size="small" color="#ffffff" /> : <Check size={16} color="#ffffff" strokeWidth={2.5} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtnGhost}
              onPress={() => setEditingId(null)}
              accessibilityRole="button"
              accessibilityLabel={t('history.cancel')}
            >
              <X size={16} color="#1D4ED8" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  function empty(titleKey: string, descKey: string) {
    return (
      <View style={styles.empty}>
        <AppText weight="semiBold" style={styles.emptyTitle}>{t(titleKey)}</AppText>
        <AppText weight="regular" style={[styles.emptyDesc, { color: '#000000' }]}>{t(descKey)}</AppText>
      </View>
    );
  }

  return (
    <View>
      {/* Tab pills, the marketplace's BAMA Market / Rental look */}
      <View style={[styles.tabs, { flexDirection: rowDir }]}>
        {(['hidden', 'sent'] as Tab[]).map((k) => {
          const active = tab === k;
          const label = t(k === 'hidden' ? 'history.tab_hidden' : 'history.tab_sent');
          return (
            <TouchableOpacity
              key={k}
              style={[styles.tab, active ? styles.tabActive : styles.tabInactive]}
              onPress={() => setTab(k)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
            >
              <AppText weight="semiBold" style={[styles.tabText, active ? styles.tabTextActive : styles.tabTextInactive]}>
                {label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'hidden' ? (
        hiddenLoading ? (
          <ActivityIndicator color="#1D4ED8" style={styles.loading} />
        ) : hidden.length === 0 ? (
          empty('history.empty_hidden_title', 'history.empty_hidden_desc')
        ) : (
          <View style={styles.list}>
            {hidden.map((p) => (
              <NoticeBoardCard
                key={p.id}
                request={p}
                poster={posters[p.clientId]}
                onPress={() => onOpenProject(p)}
                onApply={() => onOpenProject(p)}
                onMakeOffer={() => onOpenProject(p)}
                onDismiss={() => {}}
                onRestore={() => onRestore(p.id)}
                isApplying={false}
                compact
                cardWidth={cardWidth}
              />
            ))}
          </View>
        )
      ) : offersLoading ? (
        <ActivityIndicator color="#1D4ED8" style={styles.loading} />
      ) : offers.length === 0 ? (
        empty('history.empty_sent_title', 'history.empty_sent_desc')
      ) : (
        <View style={styles.list}>{offers.map(offerCard)}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 16 },
  tab: { borderRadius: 20, paddingVertical: 8, paddingHorizontal: 20 },
  // The selected tab is enlarged so it clearly stands out (MarketplaceToggle).
  tabActive: { backgroundColor: '#1D4ED8', paddingVertical: 11, paddingHorizontal: 26, borderRadius: 22 },
  tabInactive: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#1D4ED8' },
  tabText: { fontSize: 14 },
  tabTextActive: { color: '#ffffff', fontSize: 16 },
  tabTextInactive: { color: '#000000' },

  list: { gap: 12, alignItems: 'center' },
  loading: { marginVertical: 24 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 6 },
  emptyTitle: { fontSize: 16, color: '#000000', textAlign: 'center' },
  emptyDesc: { fontSize: 13, textAlign: 'center' },

  offerCard: {
    backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, padding: 14, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },
  offerCardDim: { opacity: 0.7 },
  offerTop: { alignItems: 'center', gap: 8 },
  offerTitle: { flex: 1, fontSize: 16, color: '#000000' },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11 },
  offerMeta: { fontSize: 13 },
  bundleNote: { fontSize: 11 },
  offerBottom: { alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  timeText: { fontSize: 11 },
  editBtn: { alignItems: 'center', gap: 5, backgroundColor: '#1D4ED8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  editText: { fontSize: 12, color: '#ffffff' },
  editRow: { alignItems: 'center', gap: 8, marginTop: 8 },
  priceInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  iconBtn: { width: 40, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1D4ED8' },
  iconBtnGhost: { width: 40, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});

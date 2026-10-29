import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import {
  AdminText, Card, CardHead, EmptyState, PillButton, Segment, TABULAR, TYPE, useAdminPalette, useScopedT,
} from '@features/admin/ui';
import { categoryLabelKey, HIDDEN, UNSORTED } from '../categories';
import { setRentalItemCategories } from '../rentalsService';
import type { RentalItem } from '../types';
import { CategoryPicker } from './CategoryPicker';
import { errorText } from './CompanyForm';

const PAGE = 30;
type Filter = 'visible' | 'hidden' | 'unsorted' | 'inactive' | 'all';

/** Which bucket an item is in, as the admin thinks of it. */
function bucketOf(i: RentalItem): Exclude<Filter, 'all'> {
  if (!i.active) return 'inactive';
  if (i.category === UNSORTED) return 'unsorted';
  if (i.category === HIDDEN || !i.visible) return 'hidden';
  return 'visible';
}

/**
 * What the last sync brought in, by bucket. "Hidden" includes the items of a
 * company that is not shown yet, so the admin can preview everything before
 * switching it on. Any item's category can be changed here (it becomes the
 * admin's own choice) or handed back to the automatic mapping.
 */
export function ItemsCard({
  items,
  onChanged,
  onToast,
}: {
  items: RentalItem[];
  onChanged: () => void;
  onToast: (message: string, kind: 'success' | 'error') => void;
}) {
  const p = useAdminPalette();
  const { t, rowDir, textAlign } = useScopedT('admin_rental_companies');
  const { t: tm } = useScopedT('marketplace');
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { visible: 0, hidden: 0, unsorted: 0, inactive: 0, all: items.length };
    for (const i of items) c[bucketOf(i)]++;
    return c;
  }, [items]);
  const view = filter === 'all' ? items : items.filter((i) => bucketOf(i) === filter);

  const FILTERS: { value: Filter; key: string }[] = [
    { value: 'all', key: 'items_all' },
    { value: 'visible', key: 'items_visible' },
    { value: 'hidden', key: 'items_hidden' },
    { value: 'unsorted', key: 'items_unsorted' },
    { value: 'inactive', key: 'items_inactive' },
  ];

  async function setCategory(itemId: string, category: string | null) {
    setBusy(true);
    try {
      await setRentalItemCategories([{ itemId, category }]);
      setEditing(null);
      onToast(t('saved'), 'success');
      onChanged();
    } catch (e) {
      onToast(t('save_failed', { message: errorText(e) }), 'error');
    } finally {
      setBusy(false);
    }
  }

  function categoryText(i: RentalItem): string {
    if (i.category === UNSORTED) return t('items_unsorted');
    if (i.category === HIDDEN) return t('hidden_category');
    return tm(categoryLabelKey(i.category) ?? i.category);
  }

  function priceText(i: RentalItem): string {
    if (i.pricePerDay == null) return t('price_on_request');
    const base = t('per_day', { price: i.pricePerDay.toLocaleString() });
    return i.salePrice != null ? `${base} · ${t('sale', { price: i.salePrice.toLocaleString() })}` : base;
  }

  return (
    <Card testID="items-card">
      <CardHead title={t('items_title')} sub={t('items_sub')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filters, { flexDirection: rowDir }]}>
        <Segment<Filter>
          options={FILTERS.map((f) => ({ value: f.value, label: `${t(f.key)} (${counts[f.value]})` }))}
          value={filter}
          onChange={(v) => { setFilter(v); setShown(PAGE); }}
          label={t('items_title')}
          testIDPrefix="items-filter"
        />
      </ScrollView>
      {view.length === 0 ? (
        <EmptyState text={t('items_empty')} testID="items-empty" />
      ) : (
        view.slice(0, shown).map((i) => (
          <View key={i.id} style={[styles.row, { borderTopColor: p.border }]} testID={`item-${i.id}`}>
            <View style={[styles.rowHead, { flexDirection: rowDir }]}>
              {i.images?.[0] ? (
                <Image source={{ uri: i.images[0].thumbUrl }} style={[styles.thumb, { backgroundColor: p.surface3 }]} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, { backgroundColor: p.surface3 }]} />
              )}
              <View style={styles.info}>
                <AdminText weight="semiBold" numberOfLines={2} style={[TYPE.rowName, { textAlign }]}>{i.name}</AdminText>
                <AdminText tabular numberOfLines={1} style={[TYPE.rowMeta, TABULAR, { color: p.text2, textAlign }]}>
                  {`${priceText(i)} · ${i.inStock ? t('in_stock') : t('out_of_stock')}`}
                </AdminText>
                <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text3, textAlign }]} testID={`item-category-${i.id}`}>
                  {[categoryText(i), i.manualCategory ? t('manual_badge') : null,
                    i.externalCategories?.length ? t('store_category', { name: i.externalCategories.join(', ') }) : null]
                    .filter(Boolean).join(' · ')}
                </AdminText>
              </View>
            </View>
            <View style={[styles.actions, { flexDirection: rowDir }]}>
              <PillButton label={t('set_category')} onPress={() => setEditing(editing === i.id ? null : i.id)} disabled={busy} testID={`item-edit-${i.id}`} />
              {i.manualCategory ? (
                <PillButton label={t('reset_category')} onPress={() => void setCategory(i.id, null)} disabled={busy} testID={`item-reset-${i.id}`} />
              ) : null}
              <PillButton label={t('open_in_store')} onPress={() => void Linking.openURL(i.externalUrl)} testID={`item-open-${i.id}`} />
            </View>
            {editing === i.id && (
              <CategoryPicker
                value={i.manualCategory ?? (i.category === UNSORTED ? null : i.category)}
                suggested={i.suggestedCategory}
                onChange={(v) => { if (v) void setCategory(i.id, v); }}
                testIDPrefix={`item-cat-${i.id}`}
              />
            )}
          </View>
        ))
      )}
      {view.length > shown && (
        <View style={[styles.more, { borderTopColor: p.border }]}>
          <PillButton label={t('show_more', { n: Math.min(PAGE, view.length - shown) })} onPress={() => setShown((s) => s + PAGE)} testID="items-more" />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: 18, paddingBottom: 10, flexGrow: 1 },
  row: { borderTopWidth: 1, paddingHorizontal: 18, paddingVertical: 12, gap: 8 },
  rowHead: { alignItems: 'center', gap: 10 },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  info: { flex: 1, minWidth: 0, gap: 1 },
  actions: { gap: 8, flexWrap: 'wrap' },
  more: { borderTopWidth: 1, paddingVertical: 12, alignItems: 'center' },
});

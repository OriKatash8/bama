import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import {
  AdminText, Card, CardHead, CountBadge, EmptyState, PillButton, Segment, TYPE, useAdminPalette, useScopedT,
} from '@features/admin/ui';
import { confirmDialog } from '@utils/confirmDialog';
import { categoryLabelKey, UNSORTED } from '../categories';
import { setRentalItemCategories, type Assignment } from '../rentalsService';
import type { RentalItem } from '../types';
import { CategoryPicker } from './CategoryPicker';
import { errorText } from './CompanyForm';

const PAGE = 30;
const NO_SUGGESTION = '__none__';

/**
 * Items no category map placed. Each row shows the picture, the name, the
 * store's own category and the keyword suggestion (pre-selected). The admin
 * confirms one, sets a category on a selection, or accepts every suggestion in
 * the current filter. Each choice becomes the item's manualCategory, which
 * every later sync keeps.
 */
export function NeedsSortingCard({
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

  const unsorted = useMemo(() => items.filter((i) => i.active && i.category === UNSORTED), [items]);
  const [filter, setFilter] = useState<string>('all');
  const [choice, setChoice] = useState<Record<string, string | null>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);

  const suggestionOf = (i: RentalItem) => i.suggestedCategory ?? NO_SUGGESTION;
  const view = filter === 'all' ? unsorted : unsorted.filter((i) => suggestionOf(i) === filter);
  const withSuggestion = view.filter((i) => i.suggestedCategory);

  // Filter options: every suggestion present, with counts, then "no suggestion".
  const counts = new Map<string, number>();
  for (const i of unsorted) counts.set(suggestionOf(i), (counts.get(suggestionOf(i)) ?? 0) + 1);
  const label = (k: string) => (k === NO_SUGGESTION ? t('filter_no_suggestion') : tm(categoryLabelKey(k) ?? k));
  const filterOptions = [
    { value: 'all', label: `${t('filter_all')} (${unsorted.length})` },
    ...[...counts.entries()].filter(([k]) => k !== NO_SUGGESTION).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ value: k, label: `${label(k)} (${n})` })),
    ...(counts.has(NO_SUGGESTION) ? [{ value: NO_SUGGESTION, label: `${label(NO_SUGGESTION)} (${counts.get(NO_SUGGESTION)})` }] : []),
  ];

  async function assign(assignments: Assignment[]) {
    if (assignments.length === 0) return;
    setBusy(true);
    try {
      await setRentalItemCategories(assignments);
      onToast(t('sorted_toast', { n: assignments.length }), 'success');
      setSelected(new Set());
      onChanged();
    } catch (e) {
      onToast(t('save_failed', { message: errorText(e) }), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function acceptAll() {
    const ok = await confirmDialog(t('accept_title', { n: withSuggestion.length }), t('accept_body'), {
      confirm: t('accept_confirm'), cancel: t('cancel'),
    });
    if (ok) await assign(withSuggestion.map((i) => ({ itemId: i.id, category: i.suggestedCategory })));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allInViewSelected = view.length > 0 && view.every((i) => selected.has(i.id));

  return (
    <Card testID="needs-sorting">
      <CardHead title={t('sort_title')} sub={t('sort_sub')} side={<CountBadge n={unsorted.length} testID="needs-sorting-count" />} />
      {unsorted.length === 0 ? (
        <EmptyState text={t('sort_empty')} testID="needs-sorting-empty" />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filters, { flexDirection: rowDir }]}>
            <Segment<string>
              options={filterOptions}
              value={filter}
              onChange={(v) => { setFilter(v); setShown(PAGE); }}
              label={t('sort_title')}
              testIDPrefix="sort-filter"
            />
          </ScrollView>

          {/* Bulk: the selection, a category for it, and "accept every suggestion" in this view. */}
          <View style={[styles.bulk, { borderTopColor: p.border, backgroundColor: p.surface2 }]}>
            <View style={[styles.bulkRow, { flexDirection: rowDir }]}>
              <PillButton
                label={allInViewSelected ? t('clear_selection') : t('select_all', { n: view.length })}
                onPress={() => setSelected(allInViewSelected ? new Set() : new Set(view.map((i) => i.id)))}
                disabled={busy}
                testID="sort-select-all"
              />
              <PillButton
                variant="primary"
                label={t('accept_suggestions', { n: withSuggestion.length })}
                onPress={() => void acceptAll()}
                disabled={busy || withSuggestion.length === 0}
                testID="sort-accept-all"
              />
            </View>
            {selected.size > 0 && (
              <View style={styles.bulkPick} testID="sort-bulk">
                <AdminText weight="semiBold" style={[TYPE.rowMeta, { textAlign }]}>
                  {`${t('selected_count', { n: selected.size })} · ${t('set_category')}`}
                </AdminText>
                <CategoryPicker value={bulkCategory} onChange={setBulkCategory} testIDPrefix="sort-bulk-cat" />
                <View style={{ flexDirection: rowDir }}>
                  <PillButton
                    variant="primary"
                    label={t('apply_to_selected', { n: selected.size })}
                    onPress={() => void assign([...selected].map((itemId) => ({ itemId, category: bulkCategory })))}
                    disabled={busy || !bulkCategory}
                    testID="sort-bulk-apply"
                  />
                </View>
              </View>
            )}
          </View>

          {view.slice(0, shown).map((i) => {
            const picked = choice[i.id] !== undefined ? choice[i.id] : i.suggestedCategory;
            const isSelected = selected.has(i.id);
            return (
              <View key={i.id} style={[styles.row, { borderTopColor: p.border }]} testID={`sort-row-${i.id}`}>
                <View style={[styles.rowHead, { flexDirection: rowDir }]}>
                  <Pressable
                    onPress={() => toggle(i.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={i.name}
                    hitSlop={8}
                    testID={`sort-check-${i.id}`}
                    style={[styles.check, { borderColor: isSelected ? p.accent : p.borderStrong, backgroundColor: isSelected ? p.accent : 'transparent' }]}
                  >
                    {isSelected && <Check size={14} color={p.onAccent} strokeWidth={3} />}
                  </Pressable>
                  {i.images?.[0] ? (
                    <Image source={{ uri: i.images[0].thumbUrl }} style={[styles.thumb, { backgroundColor: p.surface3 }]} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: p.surface3 }]} />
                  )}
                  <View style={styles.info}>
                    <AdminText weight="semiBold" numberOfLines={2} style={[TYPE.rowName, { textAlign }]}>{i.name}</AdminText>
                    <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>
                      {i.externalCategories?.length
                        ? t('store_category', { name: i.externalCategories.join(', ') })
                        : t('no_store_category')}
                    </AdminText>
                    <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: i.suggestedCategory ? p.accent : p.text3, textAlign }]}>
                      {i.suggestedCategory ? `${t('suggested')}: ${tm(categoryLabelKey(i.suggestedCategory) ?? '')}` : t('no_suggestion')}
                    </AdminText>
                  </View>
                </View>
                <CategoryPicker
                  value={picked ?? null}
                  suggested={i.suggestedCategory}
                  onChange={(v) => setChoice((prev) => ({ ...prev, [i.id]: v }))}
                  testIDPrefix={`sort-cat-${i.id}`}
                />
                <View style={{ flexDirection: rowDir }}>
                  <PillButton
                    label={t('confirm_one')}
                    onPress={() => void assign([{ itemId: i.id, category: picked ?? null }])}
                    disabled={busy || !picked}
                    testID={`sort-confirm-${i.id}`}
                  />
                </View>
              </View>
            );
          })}
          {view.length > shown && (
            <View style={[styles.more, { borderTopColor: p.border }]}>
              <PillButton label={t('show_more', { n: Math.min(PAGE, view.length - shown) })} onPress={() => setShown((s) => s + PAGE)} testID="sort-more" />
            </View>
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: 18, paddingBottom: 10, flexGrow: 1 },
  bulk: { borderTopWidth: 1, paddingHorizontal: 18, paddingVertical: 12, gap: 10 },
  bulkRow: { gap: 8, flexWrap: 'wrap' },
  bulkPick: { gap: 8 },
  row: { borderTopWidth: 1, paddingHorizontal: 18, paddingVertical: 12, gap: 8 },
  rowHead: { alignItems: 'center', gap: 10 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  info: { flex: 1, minWidth: 0, gap: 1 },
  more: { borderTopWidth: 1, paddingVertical: 12, alignItems: 'center' },
});

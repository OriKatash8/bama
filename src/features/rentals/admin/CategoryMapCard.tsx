import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AdminText, Card, CardHead, EmptyState, PillButton, TYPE, useAdminPalette, useScopedT,
} from '@features/admin/ui';
import { setRentalCategoryMap } from '../rentalsService';
import type { RentalCompany } from '../types';
import { CategoryPicker } from './CategoryPicker';
import { errorText } from './CompanyForm';

/**
 * Every category the store used in its last sync, each with where it goes in
 * BAMA (or "not mapped"). Saving re-applies the map to every item of the
 * company on the server — no store fetch. An item the admin sorted by hand
 * keeps its own category. The screen keys this card by the saved map, so a new
 * map from the server (a save, a sync) starts a fresh draft.
 */
export function CategoryMapCard({
  company,
  onSaved,
  onError,
}: {
  company: RentalCompany;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const p = useAdminPalette();
  const { t, rowDir, textAlign } = useScopedT('admin_rental_companies');
  const [draft, setDraft] = useState<Record<string, string>>(company.categoryMap ?? {});
  const [saving, setSaving] = useState(false);

  const external = company.externalCategories ?? [];
  const dirty = JSON.stringify(sorted(draft)) !== JSON.stringify(sorted(company.categoryMap ?? {}));

  async function save() {
    setSaving(true);
    try {
      await setRentalCategoryMap(company.id, draft);
      onSaved();
    } catch (e) {
      onError(t('save_failed', { message: errorText(e) }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card testID="category-map">
      <CardHead
        title={t('map_title')}
        sub={t('map_sub')}
        side={
          external.length > 0 ? (
            <PillButton
              variant="primary"
              label={saving ? t('saving') : t('save_map')}
              onPress={() => void save()}
              disabled={!dirty || saving}
              testID="category-map-save"
            />
          ) : undefined
        }
      />
      {external.length === 0 ? (
        <EmptyState text={t('map_empty')} testID="category-map-empty" />
      ) : (
        external.map(({ name, count }) => (
          <View key={name} style={[styles.row, { borderTopColor: p.border }]} testID={`map-row-${name}`}>
            <View style={[styles.rowHead, { flexDirection: rowDir }]}>
              <AdminText weight="semiBold" numberOfLines={2} style={[TYPE.rowName, styles.name, { textAlign }]}>{name}</AdminText>
              <AdminText style={[TYPE.rowMeta, { color: p.text3 }]}>{t('map_items', { n: count })}</AdminText>
            </View>
            <CategoryPicker
              value={draft[name] ?? null}
              noneLabel={t('not_mapped')}
              onChange={(v) => setDraft((prev) => {
                const next = { ...prev };
                if (v) next[name] = v; else delete next[name];
                return next;
              })}
              testIDPrefix={`map-${name}`}
            />
          </View>
        ))
      )}
    </Card>
  );
}

function sorted(m: Record<string, string>): [string, string][] {
  return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
}

const styles = StyleSheet.create({
  row: { borderTopWidth: 1, paddingHorizontal: 18, paddingVertical: 12, gap: 8 },
  rowHead: { alignItems: 'center', gap: 8 },
  name: { flex: 1, minWidth: 0 },
});

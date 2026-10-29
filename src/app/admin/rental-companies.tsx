import { useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useUiStore } from '@core/stores/uiStore';
import { confirmDialog } from '@utils/confirmDialog';
import {
  AdminPage, AdminText, Card, CardHead, CountBadge, EmptyState, PillButton, TYPE, useAdminPalette, useScopedT,
} from '@features/admin/ui';
import { useAdminCompanyItems, useAdminRentalCompanies } from '@features/rentals/admin/useAdminRentals';
import { CompanyCard } from '@features/rentals/admin/CompanyCard';
import { CompanyForm, errorText } from '@features/rentals/admin/CompanyForm';
import { CategoryMapCard } from '@features/rentals/admin/CategoryMapCard';
import { NeedsSortingCard } from '@features/rentals/admin/NeedsSortingCard';
import { ItemsCard } from '@features/rentals/admin/ItemsCard';
import { removeRentalCompany, setRentalCompanyActive, syncRentalCompany } from '@features/rentals/rentalsService';
import type { RentalCompany } from '@features/rentals/types';

type Busy = { id: string; what: 'sync' | 'active' | 'remove' } | null;

/** The callable's own error code and details, whatever the SDK wrapped them in. */
function callableError(e: unknown): { code: string; reason?: string; message: string } {
  const err = e as { code?: string; details?: { reason?: string } };
  return { code: String(err?.code ?? '').replace(/^functions\//, ''), reason: err?.details?.reason, message: errorText(e) };
}

/**
 * Rental companies: partners whose gear syncs from their website. Add or edit a
 * company, sync it, map its store categories, sort what the map did not place,
 * preview every item, and show it to users only when it is ready. Every change
 * goes through an admin callable (functions/src/rentals); this page writes
 * nothing to Firestore itself. confirmDialog, never Alert.alert (web).
 */
export default function RentalCompaniesAdmin() {
  const router = useRouter();
  const p = useAdminPalette();
  const { showToast } = useUiStore();
  const { t, textAlign } = useScopedT('admin_rental_companies');
  const { companies, loading, error } = useAdminRentalCompanies();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<RentalCompany | 'new' | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const { items, loading: itemsLoading, error: itemsError, reload } = useAdminCompanyItems(selectedId);

  const selected = companies.find((c) => c.id === selectedId && !c.removedAt) ?? null;
  const toast = (message: string, kind: 'success' | 'error') => showToast(message, kind);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/admin/operations');
  }

  async function sync(c: RentalCompany, force = false) {
    setBusy({ id: c.id, what: 'sync' });
    try {
      const s = await syncRentalCompany(c.id, force);
      toast(t('sync_done', { created: s.created, updated: s.updated, deactivated: s.deactivated, unchanged: s.unchanged }), 'success');
      if (c.id === selectedId) reload();
    } catch (e) {
      const err = callableError(e);
      if (err.reason === 'mass-removal' && !force) {
        setBusy(null);
        const ok = await confirmDialog(t('force_title'), t('force_body', { message: err.message }), {
          confirm: t('force_confirm'), cancel: t('cancel'),
        });
        if (ok) await sync(c, true);
        return;
      }
      toast(t('sync_failed', { message: err.message }), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(c: RentalCompany) {
    if (!c.active) {
      const ok = await confirmDialog(t('activate_title'), t('activate_body'), { confirm: t('show'), cancel: t('cancel') });
      if (!ok) return;
    }
    setBusy({ id: c.id, what: 'active' });
    try {
      await setRentalCompanyActive(c.id, !c.active);
      toast(t('saved'), 'success');
      if (c.id === selectedId) reload();
    } catch (e) {
      toast(t('save_failed', { message: errorText(e) }), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function remove(c: RentalCompany) {
    const ok = await confirmDialog(t('remove_title'), t('remove_body', { name: c.name }), {
      confirm: t('remove_confirm'), cancel: t('cancel'),
    });
    if (!ok) return;
    setBusy({ id: c.id, what: 'remove' });
    try {
      await removeRentalCompany(c.id);
      toast(t('removed_toast'), 'success');
      if (c.id === selectedId) setSelectedId(null);
    } catch (e) {
      toast(t('save_failed', { message: errorText(e) }), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminPage
      title={t('title')}
      subtitle={t('subtitle')}
      onBack={goBack}
      side={editing ? undefined : <PillButton variant="primary" label={t('add_company')} onPress={() => setEditing('new')} testID="add-company" />}
      testID="rental-companies-page"
    >
      {editing && (
        <CompanyForm
          key={editing === 'new' ? 'new' : editing.id}
          company={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            setSelectedId(id);
            toast(t('saved'), 'success');
          }}
        />
      )}

      {loading ? (
        <ActivityIndicator size="large" color={p.accent} style={styles.spinner} testID="companies-loading" />
      ) : error ? (
        <AdminText style={[TYPE.rowMeta, { color: p.bad, textAlign }]} testID="companies-error">{t('load_failed', { message: error })}</AdminText>
      ) : companies.length === 0 ? (
        <Card testID="companies-empty-card">
          <CardHead title={t('title')} side={<CountBadge n={0} />} />
          <EmptyState text={t('no_companies')} testID="companies-empty" />
        </Card>
      ) : (
        companies.map((c) => (
          <CompanyCard
            key={c.id}
            company={c}
            selected={c.id === selectedId}
            busy={busy?.id === c.id ? busy.what : null}
            onManage={() => setSelectedId(c.id === selectedId ? null : c.id)}
            onSync={() => void sync(c)}
            onToggleActive={() => void toggleActive(c)}
            onEdit={() => setEditing(c)}
            onRemove={() => void remove(c)}
          />
        ))
      )}

      {selected && (
        <>
          <CategoryMapCard
            key={`map-${selected.id}-${JSON.stringify(selected.categoryMap ?? {})}`}
            company={selected}
            onSaved={() => { toast(t('map_saved'), 'success'); reload(); }}
            onError={(m) => toast(m, 'error')}
          />
          {itemsLoading && items.length === 0 ? (
            <ActivityIndicator size="small" color={p.accent} style={styles.spinner} testID="items-loading" />
          ) : itemsError ? (
            <AdminText style={[TYPE.rowMeta, { color: p.bad, textAlign }]}>{t('load_failed', { message: itemsError })}</AdminText>
          ) : (
            <>
              <NeedsSortingCard key={`sort-${selected.id}`} items={items} onChanged={reload} onToast={toast} />
              <ItemsCard key={`items-${selected.id}`} items={items} onChanged={reload} onToast={toast} />
            </>
          )}
        </>
      )}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  spinner: { marginTop: 24 },
});

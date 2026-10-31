import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import {
  AdminText, Card, InitialsAvatar, PillButton, RADIUS, TABULAR, TYPE, useAdminPalette, useScopedT,
} from '@features/admin/ui';
import type { RentalCompany } from '../types';

export function fmtDateTime(seconds?: number | null): string {
  if (!seconds) return '—';
  const d = new Date(seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

type Busy = 'sync' | 'active' | 'remove' | null;

/**
 * One company: who it is, whether users see it, how its last sync went, and the
 * numbers the admin watches (items, shown, waiting for sorting, Storage, clicks).
 */
export function CompanyCard({
  company,
  selected,
  busy,
  onManage,
  onSync,
  onToggleActive,
  onEdit,
  onRemove,
}: {
  company: RentalCompany;
  selected: boolean;
  busy: Busy;
  onManage: () => void;
  onSync: () => void;
  onToggleActive: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const p = useAdminPalette();
  const { t, rowDir, textAlign } = useScopedT('admin_rental_companies');
  const c = company;
  const removed = !!c.removedAt;
  const id = c.id;

  const state = removed
    ? { label: t('removed'), bg: p.surface3, fg: p.text2 }
    : c.active
      ? { label: t('active'), bg: p.goodBg, fg: p.good }
      : { label: t('inactive'), bg: p.warnBg, fg: p.warn };
  const sync = {
    never: { label: t('status_never'), bg: p.surface3, fg: p.text2 },
    running: { label: t('status_running'), bg: p.accentSoft, fg: p.accent },
    ok: { label: t('status_ok'), bg: p.goodBg, fg: p.good },
    error: { label: t('status_error'), bg: p.badBg, fg: p.bad },
  }[c.syncStatus ?? 'never'];

  const meta = [
    c.city,
    c.agreementSignedAt ? t('agreement_on', { date: fmtDateTime(c.agreementSignedAt.seconds).slice(0, 10) }) : t('no_agreement'),
  ].filter(Boolean).join(' · ');
  const numbers = [
    t('items_count', { n: c.itemCount ?? 0 }),
    t('visible_count', { n: c.visibleCount ?? 0 }),
    t('unsorted_count', { n: c.unsortedCount ?? 0 }),
    t('storage_size', { mb: megabytes(c.storageBytes ?? 0) }),
    t('clicks_count', { n: c.clicks ?? 0 }),
  ].join(' · ');

  return (
    <Card testID={`company-${id}`} ring={selected}>
      <View style={[styles.head, { flexDirection: rowDir }]}>
        {c.logoUrl ? (
          <Image source={{ uri: c.logoUrl }} style={[styles.logo, { backgroundColor: p.surface3 }]} contentFit="contain" />
        ) : (
          <InitialsAvatar name={c.name} size={44} />
        )}
        <View style={styles.info}>
          <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.cardTitle, { textAlign }]}>{c.name}</AdminText>
          <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>{meta}</AdminText>
          <View style={[styles.chips, { flexDirection: rowDir }]}>
            <Pill {...state} testID={`company-state-${id}`} />
            {c.sourceType === 'woocommerce' && <Pill {...sync} testID={`company-sync-status-${id}`} />}
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <AdminText tabular style={[TYPE.rowMeta, TABULAR, { color: p.text, textAlign }]} testID={`company-numbers-${id}`}>
          {numbers}
        </AdminText>
        {c.sourceType === 'woocommerce' && (
          <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
            {`${c.sourceUrl} · ${t('last_sync', { when: fmtDateTime(c.lastSyncAt?.seconds) })}`}
          </AdminText>
        )}
        {c.syncStatus === 'error' && c.syncError ? (
          <AdminText testID={`company-sync-error-${id}`} style={[TYPE.rowMeta, { color: p.bad, textAlign }]}>
            {c.syncError}
          </AdminText>
        ) : null}

        {!removed && (
          <View style={[styles.actions, { flexDirection: rowDir }]}>
            <PillButton variant={selected ? 'primary' : 'ghost'} label={t('manage')} onPress={onManage} testID={`company-manage-${id}`} />
            {c.sourceType === 'woocommerce' && (
              <PillButton
                label={busy === 'sync' || c.syncStatus === 'running' ? t('syncing') : t('sync_now')}
                onPress={onSync}
                disabled={!!busy || c.syncStatus === 'running'}
                testID={`company-sync-${id}`}
              />
            )}
            <PillButton
              label={c.active ? t('hide') : t('show')}
              onPress={onToggleActive}
              disabled={!!busy}
              testID={`company-toggle-${id}`}
            />
            <PillButton label={t('edit')} onPress={onEdit} disabled={!!busy} testID={`company-edit-${id}`} />
            <PillButton variant="danger" label={t('remove')} onPress={onRemove} disabled={!!busy} testID={`company-remove-${id}`} />
          </View>
        )}
      </View>
    </Card>
  );
}

function Pill({ label, bg, fg, testID }: { label: string; bg: string; fg: string; testID?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]} testID={testID}>
      <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.chip, { color: fg }]}>{label}</AdminText>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 16 },
  logo: { width: 44, height: 44, borderRadius: 12 },
  info: { flex: 1, minWidth: 0, gap: 2 },
  chips: { gap: 6, marginTop: 4, flexWrap: 'wrap' },
  pill: { borderRadius: RADIUS.pill, paddingVertical: 3, paddingHorizontal: 9 },
  body: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16, gap: 4 },
  actions: { gap: 8, marginTop: 10, flexWrap: 'wrap' },
});

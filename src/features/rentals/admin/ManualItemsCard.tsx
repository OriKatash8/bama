import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ExternalLink } from 'lucide-react-native';
import { TextInput } from '@components/ui/Text';
import { useAuthStore } from '@core/stores/authStore';
import { confirmDialog } from '@utils/confirmDialog';
import {
  AdminText, Card, CardHead, CountBadge, EmptyState, HEEBO, PillButton, TYPE, useAdminPalette, useScopedT,
} from '@features/admin/ui';
import { categoryLabelKey, HIDDEN } from '../categories';
import {
  removeRentalItem, saveRentalItem, uploadRentalImage, type ManualImage, type SaveRentalItemInput,
} from '../rentalsService';
import type { RentalCompany, RentalItem } from '../types';
import { CategoryPicker } from './CategoryPicker';
import { errorText } from './CompanyForm';

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;
const PRICE_MAX = 100_000;

type Draft = {
  name: string;
  price: string;
  category: string | null;
  description: string;
  productUrl: string;
  /** A picked local file (uploaded on save). */
  pickedUri: string | null;
  /** A pasted image URL. */
  imageUrl: string;
  /** Editing: the admin removed the current picture. */
  removeImage: boolean;
};

const EMPTY: Draft = { name: '', price: '', category: null, description: '', productUrl: '', pickedUri: null, imageUrl: '', removeImage: false };

/** `companyLink` is what an item without its own page links to (adminSaveRentalItem's fallback). */
function draftOf(item: RentalItem, companyLink: string | null): Draft {
  return {
    name: item.name,
    price: item.pricePerDay != null ? String(item.pricePerDay) : '',
    category: item.manualCategory ?? (item.category === 'unsorted' ? null : item.category),
    description: item.description ?? '',
    // The item's own page only — not the company site it falls back to.
    productUrl: item.externalUrl && item.externalUrl !== companyLink ? item.externalUrl : '',
    pickedUri: null,
    imageUrl: '',
    removeImage: false,
  };
}

/**
 * A manual company's items — a shop with no store BAMA can read (a Wix site,
 * for example). The admin adds, edits and removes them here; each one is saved
 * by adminSaveRentalItem, which validates it and builds it like a synced item,
 * so it shows in the rental tab exactly like one. A picture is picked from the
 * device (uploaded to the admin's own staging folder) or given as a URL.
 */
export function ManualItemsCard({
  company,
  items,
  onChanged,
  onToast,
}: {
  company: RentalCompany;
  items: RentalItem[];
  onChanged: () => void;
  onToast: (message: string, kind: 'success' | 'error') => void;
}) {
  const p = useAdminPalette();
  const { t, rowDir, textAlign } = useScopedT('admin_rental_companies');
  const { t: tm } = useScopedT('marketplace');
  const uid = useAuthStore((s) => s.user?.id) ?? '';
  const live = items.filter((i) => i.active);

  const [editing, setEditing] = useState<RentalItem | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState<'save' | 'upload' | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Draft>(k: K) => (v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  function open(target: RentalItem | 'new') {
    setEditing(target);
    setDraft(target === 'new' ? EMPTY : draftOf(target, company.website || company.sourceUrl || null));
    setError(null);
  }

  async function pick() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as const, quality: 0.9 });
    if (!r.canceled) setDraft((d) => ({ ...d, pickedUri: r.assets[0].uri, imageUrl: '', removeImage: false }));
  }

  /** Client checks only stop an obviously incomplete form; the function validates everything again. */
  function check(): string | null {
    if (!draft.name.trim()) return t('name_item_required');
    if (!draft.category) return t('category_required');
    if (draft.price.trim()) {
      const n = Number(draft.price.replace(/,/g, ''));
      if (!Number.isFinite(n) || n < 1 || n > PRICE_MAX) return t('price_invalid');
    }
    return null;
  }

  async function save() {
    const problem = check();
    if (problem) { setError(problem); return; }
    setError(null);
    try {
      let image: ManualImage | undefined;
      if (draft.pickedUri) {
        setBusy('upload');
        image = { uploadPath: await uploadRentalImage(uid, draft.pickedUri) };
      } else if (draft.imageUrl.trim()) {
        image = { url: draft.imageUrl.trim() };
      } else if (draft.removeImage) {
        image = null;
      }
      setBusy('save');
      const input: SaveRentalItemInput = {
        companyId: company.id,
        ...(editing !== 'new' && editing ? { itemId: editing.id } : {}),
        name: draft.name.trim(),
        pricePerDay: draft.price.trim() ? Number(draft.price.replace(/,/g, '')) : null,
        category: draft.category!,
        description: draft.description.trim(),
        productUrl: draft.productUrl.trim() || null,
        ...(image !== undefined ? { image } : {}),
      };
      await saveRentalItem(input);
      onToast(t('item_saved'), 'success');
      setEditing(null);
      onChanged();
    } catch (e) {
      setError(t('save_failed', { message: errorText(e) }));
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: RentalItem) {
    const ok = await confirmDialog(t('remove_item_title'), t('remove_item_body', { name: item.name }), {
      confirm: t('remove_item_confirm'), cancel: t('cancel'),
    });
    if (!ok) return;
    setBusy(item.id);
    try {
      await removeRentalItem(item.id);
      onToast(t('item_removed'), 'success');
      onChanged();
    } catch (e) {
      onToast(t('save_failed', { message: errorText(e) }), 'error');
    } finally {
      setBusy(null);
    }
  }

  function priceText(i: RentalItem): string {
    return i.pricePerDay == null ? t('price_on_request') : t('per_day', { price: i.pricePerDay.toLocaleString() });
  }

  function categoryText(i: RentalItem): string {
    if (i.category === HIDDEN) return t('hidden_category');
    const key = categoryLabelKey(i.category);
    return key ? tm(key) : t('items_unsorted');
  }

  function input(k: 'name' | 'price' | 'description' | 'productUrl' | 'imageUrl', label: string, opts: { hint?: string; ltr?: boolean; numeric?: boolean; multiline?: boolean } = {}) {
    return (
      <View style={styles.field}>
        <AdminText weight="medium" style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>{label}</AdminText>
        <TextInput
          value={draft[k]}
          onChangeText={set(k)}
          placeholder={opts.hint}
          placeholderTextColor={p.text3}
          accessibilityLabel={label}
          autoCapitalize={opts.ltr ? 'none' : 'sentences'}
          autoCorrect={false}
          keyboardType={opts.numeric ? 'decimal-pad' : opts.ltr ? 'url' : 'default'}
          multiline={opts.multiline}
          testID={`manual-field-${k}`}
          style={[
            styles.input, webNoOutline, opts.multiline && styles.multiline,
            { color: p.text, borderColor: p.border, backgroundColor: p.surface2, fontFamily: HEEBO.regular, textAlign: opts.ltr ? 'left' : textAlign },
          ]}
        />
      </View>
    );
  }

  const currentThumb = editing && editing !== 'new' && !draft.removeImage ? editing.images?.[0]?.thumbUrl : undefined;
  const preview = draft.pickedUri ?? (draft.imageUrl.trim() || currentThumb);

  return (
    <Card testID="manual-items">
      <CardHead
        title={t('manual_title')}
        sub={t('manual_sub')}
        side={
          <View style={[styles.headSide, { flexDirection: rowDir }]}>
            <CountBadge n={live.length} testID="manual-items-count" />
            {!editing && <PillButton variant="primary" label={t('add_item')} onPress={() => open('new')} testID="manual-add" />}
          </View>
        }
      />

      {editing && (
        <View style={[styles.form, { borderTopColor: p.border, backgroundColor: p.surface2 }]} testID="manual-form">
          <AdminText weight="semiBold" style={[TYPE.cardTitle, { textAlign }]}>
            {editing === 'new' ? t('add_item') : t('edit_item')}
          </AdminText>
          {input('name', t('item_name'))}
          {input('price', t('item_price'), { hint: t('item_price_hint'), ltr: true, numeric: true })}
          <View style={styles.field}>
            <AdminText weight="medium" style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>{t('item_category')}</AdminText>
            <CategoryPicker value={draft.category} onChange={set('category')} testIDPrefix="manual-cat" />
          </View>
          <View style={styles.field}>
            <AdminText weight="medium" style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>{t('item_image')}</AdminText>
            <View style={[styles.imageRow, { flexDirection: rowDir }]}>
              {preview ? (
                <Image source={{ uri: preview }} style={[styles.preview, { backgroundColor: p.surface3 }]} contentFit="cover" testID="manual-preview" />
              ) : null}
              <PillButton label={t('image_pick')} onPress={() => void pick()} testID="manual-pick" />
              {(currentThumb || draft.pickedUri || draft.imageUrl) ? (
                <PillButton
                  label={t('image_remove')}
                  onPress={() => setDraft((d) => ({ ...d, pickedUri: null, imageUrl: '', removeImage: true }))}
                  testID="manual-image-remove"
                />
              ) : null}
            </View>
          </View>
          {input('imageUrl', t('image_or_url'), { hint: 'https://…/photo.jpg', ltr: true })}
          {input('productUrl', t('item_url'), { hint: t('item_url_hint'), ltr: true })}
          {input('description', t('item_description'), { multiline: true })}
          {error ? <AdminText testID="manual-error" style={[TYPE.rowMeta, { color: p.bad, textAlign }]}>{error}</AdminText> : null}
          <View style={[styles.actions, { flexDirection: rowDir }]}>
            <PillButton
              variant="primary"
              label={busy === 'upload' ? t('uploading') : busy === 'save' ? t('saving') : t('save')}
              onPress={() => void save()}
              disabled={busy === 'upload' || busy === 'save'}
              testID="manual-save"
            />
            <PillButton label={t('cancel')} onPress={() => setEditing(null)} disabled={busy === 'upload' || busy === 'save'} testID="manual-cancel" />
          </View>
        </View>
      )}

      {live.length === 0 ? (
        <EmptyState text={t('no_items')} testID="manual-empty" />
      ) : (
        live.map((i) => (
          <View key={i.id} style={[styles.row, { borderTopColor: p.border }]} testID={`manual-item-${i.id}`}>
            <View style={[styles.rowHead, { flexDirection: rowDir }]}>
              {i.images?.[0] ? (
                <Image source={{ uri: i.images[0].thumbUrl }} style={[styles.thumb, { backgroundColor: p.surface3 }]} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, { backgroundColor: p.surface3 }]} />
              )}
              <View style={styles.info}>
                <AdminText weight="semiBold" numberOfLines={2} style={[TYPE.rowName, { textAlign }]}>{i.name}</AdminText>
                <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>
                  {`${priceText(i)} · ${categoryText(i)}`}
                </AdminText>
              </View>
            </View>
            <View style={[styles.actions, { flexDirection: rowDir }]}>
              <PillButton label={t('edit')} onPress={() => open(i)} disabled={!!busy} testID={`manual-edit-${i.id}`} />
              <Pressable
                onPress={() => void Linking.openURL(i.externalUrl)}
                accessibilityRole="link"
                accessibilityLabel={t('open_in_store')}
                style={[styles.linkBtn, { backgroundColor: p.surface3 }]}
              >
                <ExternalLink size={14} color={p.text2} strokeWidth={2.2} />
              </Pressable>
              <PillButton variant="danger" label={t('remove')} onPress={() => void remove(i)} disabled={!!busy} testID={`manual-remove-${i.id}`} />
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headSide: { alignItems: 'center', gap: 8 },
  form: { borderTopWidth: 1, paddingHorizontal: 18, paddingVertical: 14, gap: 10 },
  field: { gap: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  imageRow: { alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  preview: { width: 64, height: 64, borderRadius: 10 },
  actions: { gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  row: { borderTopWidth: 1, paddingHorizontal: 18, paddingVertical: 12, gap: 8 },
  rowHead: { alignItems: 'center', gap: 10 },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  info: { flex: 1, minWidth: 0, gap: 1 },
  linkBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});

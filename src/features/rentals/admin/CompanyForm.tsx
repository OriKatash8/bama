import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { TextInput } from '@components/ui/Text';
import {
  AdminText, Card, CardHead, HEEBO, PillButton, Segment, TYPE, useAdminPalette, useScopedT,
} from '@features/admin/ui';
import { saveRentalCompany, type SaveCompanyInput, type SourceType } from '../rentalsService';
import type { RentalCompany } from '../types';

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

type Field = 'name' | 'city' | 'address' | 'phone' | 'whatsapp' | 'website' | 'sourceUrl' | 'logoSourceUrl';

/** The server's error text, without the SDK's "FirebaseError:" wrapping. */
export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^Firebase(Error)?:\s*/i, '');
}

/**
 * Add or edit a company. Everything is validated again by adminSaveRentalCompany;
 * the checks here only stop an obviously empty form. A new company is created
 * hidden from users.
 */
export function CompanyForm({
  company,
  onSaved,
  onCancel,
}: {
  company: RentalCompany | null;
  onSaved: (companyId: string) => void;
  onCancel: () => void;
}) {
  const p = useAdminPalette();
  const { t, rowDir, textAlign } = useScopedT('admin_rental_companies');
  const [values, setValues] = useState<Record<Field, string>>({
    name: company?.name ?? '',
    city: company?.city ?? '',
    address: company?.address ?? '',
    phone: company?.phone ?? '',
    whatsapp: company?.whatsapp ?? '',
    website: company?.website ?? '',
    sourceUrl: company?.sourceUrl ?? '',
    logoSourceUrl: company?.logoSourceUrl ?? '',
  });
  const [sourceType, setSourceType] = useState<SourceType>(company?.sourceType ?? 'woocommerce');
  const [signed, setSigned] = useState<'yes' | 'no'>(company?.agreementSignedAt ? 'yes' : 'no');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (f: Field) => (v: string) => setValues((prev) => ({ ...prev, [f]: v }));

  async function save() {
    if (!values.name.trim()) { setError(t('name_required')); return; }
    if (sourceType === 'woocommerce' && !values.sourceUrl.trim()) { setError(t('url_required')); return; }
    const keepDate = company?.agreementSignedAt ? company.agreementSignedAt.seconds * 1000 : Date.now();
    const input: SaveCompanyInput = {
      ...(company ? { companyId: company.id } : {}),
      name: values.name.trim(),
      city: values.city.trim(),
      address: values.address.trim(),
      phone: values.phone.trim(),
      whatsapp: values.whatsapp.trim(),
      website: values.website.trim(),
      sourceType,
      sourceUrl: values.sourceUrl.trim(),
      logoSourceUrl: values.logoSourceUrl.trim() || null,
      agreementSignedAt: signed === 'yes' ? keepDate : null,
    };
    setSaving(true);
    setError(null);
    try {
      const { companyId } = await saveRentalCompany(input);
      onSaved(companyId);
    } catch (e) {
      setError(t('save_failed', { message: errorText(e) }));
    } finally {
      setSaving(false);
    }
  }

  function field(f: Field, label: string, opts: { kind?: 'url' | 'phone'; hint?: string } = {}) {
    const ltr = !!opts.kind;
    return (
      <View style={styles.field} key={f}>
        <AdminText weight="medium" style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>{label}</AdminText>
        <TextInput
          value={values[f]}
          onChangeText={set(f)}
          placeholder={opts.hint}
          placeholderTextColor={p.text3}
          accessibilityLabel={label}
          autoCapitalize={ltr ? 'none' : 'words'}
          autoCorrect={false}
          keyboardType={opts.kind === 'url' ? 'url' : opts.kind === 'phone' ? 'phone-pad' : 'default'}
          testID={`company-field-${f}`}
          // URLs and phone numbers read left to right, in Hebrew too.
          style={[
            styles.input, webNoOutline,
            { color: p.text, borderColor: p.border, backgroundColor: p.surface2, fontFamily: HEEBO.regular, textAlign: ltr ? 'left' : textAlign },
          ]}
        />
      </View>
    );
  }

  return (
    <Card testID="company-form">
      <CardHead title={company ? company.name : t('new_company')} />
      <View style={styles.body}>
        {field('name', t('field_name'))}
        {field('city', t('field_city'))}
        {field('address', t('field_address'))}
        {field('phone', t('field_phone'), { kind: 'phone' })}
        {field('whatsapp', t('field_whatsapp'), { kind: 'phone' })}
        {field('website', t('field_website'), { kind: 'url', hint: 'https://' })}
        {field('logoSourceUrl', t('field_logo'), { kind: 'url', hint: 'https://…/logo.png' })}

        <AdminText weight="medium" style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>{t('field_source_type')}</AdminText>
        <View style={{ flexDirection: rowDir }}>
          <Segment<SourceType>
            options={[
              { value: 'woocommerce', label: t('source_woocommerce') },
              { value: 'manual', label: t('source_manual') },
            ]}
            value={sourceType}
            onChange={setSourceType}
            label={t('field_source_type')}
            testIDPrefix="company-source"
          />
        </View>
        {sourceType === 'woocommerce' && field('sourceUrl', t('field_source_url'), { kind: 'url', hint: t('field_source_url_hint') })}

        <AdminText weight="medium" style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>{t('field_agreement')}</AdminText>
        <View style={{ flexDirection: rowDir }}>
          <Segment<'yes' | 'no'>
            options={[{ value: 'no', label: t('agreement_no') }, { value: 'yes', label: t('agreement_yes') }]}
            value={signed}
            onChange={setSigned}
            label={t('field_agreement')}
            testIDPrefix="company-agreement"
          />
        </View>

        {error ? (
          <AdminText testID="company-form-error" style={[TYPE.rowMeta, { color: p.bad, textAlign }]}>{error}</AdminText>
        ) : null}
        <View style={[styles.actions, { flexDirection: rowDir }]}>
          <PillButton variant="primary" label={saving ? t('saving') : t('save')} onPress={() => void save()} disabled={saving} testID="company-save" />
          <PillButton label={t('cancel')} onPress={onCancel} disabled={saving} testID="company-cancel" />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 18, gap: 10 },
  field: { gap: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  actions: { gap: 8, marginTop: 6 },
});

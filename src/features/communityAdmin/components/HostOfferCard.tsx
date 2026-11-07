import { StyleSheet, View } from 'react-native';
import { useScopedT } from '../i18n';
import { SPACE, TYPE } from '../theme';
import { AdminText, Card, PillButton } from './primitives';
import { useAdminPalette } from '../i18n';

/**
 * A hosting offer that is out and not yet answered: who it is waiting on, when it
 * lapses, and the way to take it back. Shown only while one is pending; the host
 * stays in charge the whole time.
 */
export function HostOfferCard({
  name,
  expiresAtMs,
  busy,
  onCancel,
}: {
  name: string;
  expiresAtMs: number;
  busy: boolean;
  onCancel: () => void;
}) {
  const p = useAdminPalette();
  const { t, rowDir, textAlign, lang } = useScopedT('owner_transfer');
  const date = new Date(expiresAtMs).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  });
  return (
    <Card testID="host-offer-card">
      <View style={[styles.body, { flexDirection: rowDir }]}>
        <View style={styles.text}>
          <AdminText weight="semiBold" accessibilityRole="header" style={[TYPE.cardTitle, { textAlign }]}>
            {t('pending_title')}
          </AdminText>
          <AdminText style={[styles.sub, { color: p.text2, textAlign }]}>{t('pending_body', { name, date })}</AdminText>
        </View>
        <PillButton label={t('cancel_offer')} onPress={onCancel} disabled={busy} testID="cancel-host-offer" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: 12, padding: SPACE.rowPadH, paddingVertical: 16, flexWrap: 'wrap' },
  text: { flex: 1, minWidth: 200, gap: 4 },
  sub: { fontSize: 13, lineHeight: 22 },
});

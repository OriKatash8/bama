import { StyleSheet, View } from 'react-native';
import { useAdminPalette, useAdminT } from '../i18n';
import { SPACE, TYPE } from '../theme';
import { AdminText, Card, CountBadge, EmptyState, InitialsAvatar, PillButton, Row, WhoBlock } from './primitives';
import { CollapseOut } from './CollapseOut';

export type RequestRowData = { userId: string; name: string; meta: string };

/**
 * The priority card, first on the screen: pending join requests, oldest first.
 * Two columns from 900px — each track is a fixed 50% with `minWidth: 0`, so a
 * row shrinks its text instead of pushing its buttons out of the card.
 */
export function RequestsCard({
  rows,
  pendingCount,
  twoColumns,
  onApprove,
  onReject,
  onApproveAll,
  onGone,
}: {
  rows: { item: RequestRowData; leaving: boolean }[];
  /** Live pending count, not counting rows already collapsing away. */
  pendingCount: number;
  twoColumns: boolean;
  onApprove: (r: RequestRowData) => void;
  onReject: (r: RequestRowData) => void;
  onApproveAll: () => void;
  onGone: (userId: string) => void;
}) {
  const p = useAdminPalette();
  const { t, rowDir, textAlign } = useAdminT();

  return (
    <Card priority testID="requests-card">
      <View style={[styles.head, { flexDirection: rowDir }]}>
        <AdminText weight="semiBold" accessibilityRole="header" style={TYPE.priorityTitle}>
          {t('requests_title')}
        </AdminText>
        <CountBadge n={pendingCount} testID="requests-count" />
        <View style={styles.spacer} />
        <PillButton
          label={t('approve_all')}
          onPress={onApproveAll}
          disabled={pendingCount === 0}
          testID="approve-all"
        />
      </View>
      <AdminText style={[styles.note, { color: p.text3, textAlign }]}>{t('requests_note')}</AdminText>
      <View style={[styles.list, twoColumns && { flexDirection: rowDir, flexWrap: 'wrap' }]}>
        {rows.length === 0 ? (
          <View style={styles.full}>
            <EmptyState text={t('empty_requests')} testID="requests-empty" />
          </View>
        ) : (
          rows.map(({ item, leaving }) => (
            <View key={item.userId} testID={`request-col-${item.userId}`} style={twoColumns ? styles.half : styles.full}>
              <CollapseOut leaving={leaving} onGone={() => onGone(item.userId)}>
                <Row rowDir={rowDir} testID={`request-${item.userId}`}>
                  <InitialsAvatar name={item.name} />
                  <WhoBlock name={item.name} meta={item.meta} textAlign={textAlign} />
                  <View style={[styles.actions, { flexDirection: rowDir }]}>
                    <PillButton
                      variant="primary"
                      label={t('approve')}
                      onPress={() => onApprove(item)}
                      disabled={leaving}
                      testID={`approve-${item.userId}`}
                    />
                    <PillButton
                      label={t('reject')}
                      onPress={() => onReject(item)}
                      disabled={leaving}
                      testID={`reject-${item.userId}`}
                    />
                  </View>
                </Row>
              </CollapseOut>
            </View>
          ))
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 10, paddingTop: 16, paddingHorizontal: SPACE.rowPadH },
  spacer: { flex: 1 },
  note: { fontSize: 12, paddingTop: 12, paddingHorizontal: SPACE.rowPadH },
  list: { marginTop: 10 },
  full: { width: '100%' },
  half: { width: '50%', minWidth: 0, overflow: 'hidden' },
  actions: { gap: 7, flexShrink: 0 },
});

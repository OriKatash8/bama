import { StyleSheet, View } from 'react-native';
import { AdminText } from '@features/communityAdmin/components/primitives';
import { useAdminPalette, useScopedT } from '@features/communityAdmin/i18n';
import { TYPE } from '@features/communityAdmin/theme';
import { UserMoreButton } from './UserMoreButton';

/**
 * One line naming a person ("Professional: Dana Levi") with the ⋮ beside it, for the cards that mention
 * people in a sentence rather than as a row of their own (disputes, reports). `text` is the finished,
 * translated sentence, built from the full name, never the uid.
 */
export function PersonLine({
  uid, name, text, color, testID,
}: { uid: string | null | undefined; name: string; text: string; color?: string; testID?: string }) {
  const p = useAdminPalette();
  const { rowDir, textAlign } = useScopedT('admin_people');
  return (
    <View style={[styles.line, { flexDirection: rowDir }]} testID={testID}>
      <AdminText style={[TYPE.rowMeta, styles.text, { color: color ?? p.text3, textAlign }]}>{text}</AdminText>
      {uid ? <UserMoreButton uid={uid} name={name} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { alignItems: 'center', gap: 4 },
  text: { flexShrink: 1 },
});

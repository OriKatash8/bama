import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { EllipsisVertical } from 'lucide-react-native';
import { useAdminPalette, useScopedT } from '@features/communityAdmin/i18n';
import { UserDetailsSheet } from './UserDetailsSheet';

/**
 * The three dots beside a person's card: opens their details (UserDetailsSheet). The card shows the full
 * name; everything else, including the id, is behind this. 44px hit area for a thumb.
 */
export function UserMoreButton({
  uid, name, actions, testID,
}: { uid: string; name?: string; actions?: ReactNode | ((close: () => void) => ReactNode); testID?: string }) {
  const p = useAdminPalette();
  const { t } = useScopedT('admin_people');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={name ? `${t('more_details')} · ${name}` : t('more_details')}
        hitSlop={6}
        testID={testID ?? `user-more-${uid}`}
        style={({ pressed }) => [styles.btn, { backgroundColor: pressed ? p.surface3 : 'transparent' }]}
      >
        <EllipsisVertical size={18} color={p.text2} strokeWidth={2.2} />
      </Pressable>
      <UserDetailsSheet uid={uid} name={name} visible={open} onClose={() => setOpen(false)} actions={actions} testID={`user-details-${uid}`} />
    </>
  );
}

const styles = StyleSheet.create({
  btn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

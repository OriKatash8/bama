import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSafeForm } from '@components/KeyboardSafeForm';
import { useAdminPalette } from '@features/communityAdmin/i18n';
import { Card } from '@features/communityAdmin/components/primitives';
import { SPACE } from '@features/communityAdmin/theme';

/**
 * The admin pages' modal: a centred card over a scrim, that fits the screen.
 *
 * The old per-screen modals had no keyboard avoidance and no safe-area padding, so on a
 * phone a multiline input in a centred card could sit under the keyboard, and a fixed
 * `maxHeight` could be taller than the window. Here the card is capped to the window
 * minus the safe-area insets, its content scrolls, and the form lifts above the keyboard.
 */
export function AdminSheet({
  visible,
  onClose,
  closeLabel,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  /** Accessibility label of the scrim (it closes the sheet). */
  closeLabel: string;
  children: ReactNode;
  testID?: string;
}) {
  const p = useAdminPalette();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // Room left for the card once the safe areas and the overlay padding are taken.
  const maxHeight = Math.max(240, height - insets.top - insets.bottom - OVERLAY_PAD * 2);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insets.top + OVERLAY_PAD, paddingBottom: insets.bottom + OVERLAY_PAD }]}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim, { backgroundColor: p.shadow }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <Card style={[styles.card, { maxHeight }]} testID={testID}>
          <KeyboardSafeForm contentContainerStyle={styles.body} bounces={false}>
            {children}
          </KeyboardSafeForm>
        </Card>
      </View>
    </Modal>
  );
}

const OVERLAY_PAD = 16;

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: OVERLAY_PAD },
  scrim: { opacity: 0.45 },
  card: { width: '100%', maxWidth: 420 },
  body: { padding: SPACE.cardPad + 1, gap: 10 },
});

import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { shadow } from '@core/theme/shadow';

type BottomSheetProps = {
  visible: boolean;
  /** Tapping the scrim dismisses. The grabber is decorative — nothing drags yet. */
  onClose: () => void;
  children: React.ReactNode;
};

/** The tabs layout zeroes the safe-area context, so read the real inset here. */
const BOTTOM_INSET = initialWindowMetrics?.insets.bottom ?? 0;

/**
 * A sheet anchored to the bottom of the screen: scrim, rounded top, grabber.
 * It is a layer over the page rather than a card floating in the middle of it.
 *
 * Presentation only. The caller supplies the content, and decides what stays
 * put and what scrolls — the sheet caps its own height, so a caller that wants
 * a pinned header puts the body in its own ScrollView inside.
 */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(26,22,38,0.45)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#FFFFFF',
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 26 + BOTTOM_INSET,
    gap: 14,
    ...shadow({ color: '#1A1626', opacity: 0.3, radius: 17, offsetX: 0, offsetY: -10, elevation: 24 }),
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 99,
    backgroundColor: '#DDD9E8',
    alignSelf: 'center',
  },
});

import { InputAccessoryView, Keyboard, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@components/ui/Text';
import { useAppFont } from '@core/hooks/useAppFont';

/**
 * The "Done" bar above the iOS keyboard. Multiline boxes (Return adds a line) and numeric
 * keypads (no Return key at all) have no other way to close it. Render it once per screen and
 * give each text field `inputAccessoryViewID={nativeID}`. iOS only: renders nothing elsewhere.
 * The button sits at the trailing side (right in English, left in Hebrew).
 */
export function KeyboardDoneBar({ nativeID, rtl, label }: { nativeID: string; rtl: boolean; label: string }) {
  const font = useAppFont();
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View testID="keyboard-done-bar" style={[styles.bar, { flexDirection: rtl ? 'row' : 'row-reverse' }]}>
        <TouchableOpacity
          onPress={Keyboard.dismiss}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={label}
          testID="keyboard-done"
        >
          <Text style={[styles.text, { ...font.semiBold }]}>{label}</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#F2F2F7',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C7C7CC',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  text: { fontSize: 17, color: '#007AFF' },
});

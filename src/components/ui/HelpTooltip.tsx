import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppFont } from '@core/hooks/useAppFont';
import { useTheme } from '@core/hooks/useTheme';

type Props = { text: string };

export function HelpTooltip({ text }: Props) {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, height: 0 });
  const btnRef = useRef<View>(null);
  const colors = useTheme();
  const font = useAppFont();

  function openPopover() {
    btnRef.current?.measureInWindow((x, y, _w, h) => {
      setAnchor({ x, y, height: h });
      setVisible(true);
    });
  }

  const popoverTop = anchor.y + anchor.height + 6;
  const popoverLeft = Math.max(8, anchor.x - 90);

  return (
    <View ref={btnRef} collapsable={false}>
      <Pressable onPress={openPopover} style={styles.btn} hitSlop={8}>
        <Text style={styles.q}>?</Text>
      </Pressable>

      {visible && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setVisible(false)}>
          <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
            <Pressable
              style={[
                styles.popover,
                { backgroundColor: colors.card, top: popoverTop, left: popoverLeft },
              ]}
              onPress={() => setVisible(false)}
            >
              <Text style={[styles.popoverText, { color: colors.text, fontFamily: font.regular }]}>
                {text}
              </Text>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
  },
  q: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  popover: {
    position: 'absolute',
    borderRadius: 8,
    padding: 10,
    maxWidth: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 999,
  },
  popoverText: {
    fontSize: 13,
  },
});

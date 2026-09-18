import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useAppFont } from '@core/hooks/useAppFont';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Props = { text: string };

/** Must match `popover.maxWidth` — the clamp needs a number, not a style. */
const POPOVER_WIDTH = 220;

/** 18pt circle + 13 on every side = the 44pt minimum touch target. */
const HIT_SLOP = { top: 13, bottom: 13, left: 13, right: 13 };

export function HelpTooltip({ text }: Props) {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, height: 0 });
  const btnRef = useRef<View>(null);
  const colors = useTheme();
  const font = useAppFont();
  const { width: screenWidth } = useWindowDimensions();
  const rtl = useSettingsStore((s) => s.language) === 'he';

  function openPopover() {
    btnRef.current?.measureInWindow((x, y, _w, h) => {
      setAnchor({ x, y, height: h });
      setVisible(true);
    });
  }

  const popoverTop = anchor.y + anchor.height + 6;
  // Clamped at BOTH edges. The old `Math.max(8, anchor.x - 90)` only guarded the
  // left, so a 220-wide popover anchored near the right edge ran off screen —
  // which is where these buttons sit in Hebrew.
  const popoverLeft = Math.min(
    Math.max(8, anchor.x - POPOVER_WIDTH / 2),
    Math.max(8, screenWidth - POPOVER_WIDTH - 8),
  );

  return (
    <View ref={btnRef} collapsable={false}>
      <Pressable
        onPress={openPopover}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={(rtl ? he : en).common.help}
      >
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
              <Text
                style={[
                  styles.popoverText,
                  // Help text is a sentence, so it has to follow the language.
                  { color: colors.text, textAlign: rtl ? 'right' : 'left', ...font.regular },
                ]}
              >
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
    backgroundColor: '#EFEDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { backgroundColor: '#E4E0EF' },
  q: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
    color: '#7A7788',
    textAlign: 'center',
    includeFontPadding: false,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  popover: {
    position: 'absolute',
    borderRadius: 8,
    padding: 10,
    maxWidth: POPOVER_WIDTH,
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

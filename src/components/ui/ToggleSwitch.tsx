import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@core/hooks/useTheme';

type Props = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

const TRACK_W = 46;
const TRACK_H = 28;
const BORDER = 1;
const THUMB = 22;
/** Thumb travel inside the border, with an equal gap on each side. */
const GAP = (TRACK_H - BORDER * 2 - THUMB) / 2;
const TRAVEL = TRACK_W - BORDER * 2 - THUMB - GAP * 2;

/**
 * A switch that looks the same on iOS, Android and web.
 *
 * RN's Switch cannot border its track, and each platform fills the OFF track
 * differently (iOS needs ios_backgroundColor, web ignores it), so on a white card
 * the OFF state all but disappeared. Here the OFF track is a filled grey with a
 * visible border and the ON track is the primary colour.
 */
export function ToggleSwitch({ value, onValueChange, disabled, accessibilityLabel }: Props) {
  const colors = useTheme();
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 160,
      // The native driver does not exist on web; it only animates transform here.
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [value, progress]);

  return (
    <Pressable
      testID="toggle-track"
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={[
        styles.track,
        value
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : styles.trackOff,
        disabled && styles.disabled,
      ]}
    >
      <Animated.View
        style={[
          styles.thumb,
          { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }) }] },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    borderWidth: BORDER,
    padding: GAP,
    justifyContent: 'center',
  },
  // No theme token is a neutral grey — `border`/`borderMuted` are 12%/6% primary
  // tints, which is what made the old OFF track vanish on a white card.
  trackOff: { backgroundColor: '#e4e7ef', borderColor: '#b9bfd0' },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  disabled: { opacity: 0.5 },
});

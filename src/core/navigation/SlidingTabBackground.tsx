import { useRef, useState, useEffect } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { useSegments } from 'expo-router';

type Props = { numTabs: number; tabNames: string[] };

export function SlidingTabBackground({ numTabs, tabNames }: Props) {
  const segments = useSegments();
  const activeSegment = segments.find(s => tabNames.includes(s)) ?? tabNames[0];
  const activeIndex = Math.max(0, tabNames.indexOf(activeSegment));

  const [width, setWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: activeIndex,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [activeIndex]);

  const pillWidth = width / numTabs;

  return (
    <View style={StyleSheet.absoluteFill} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.View
          style={[
            styles.pill,
            {
              width: pillWidth - 8,
              transform: [{
                translateX: slideAnim.interpolate({
                  inputRange:  Array.from({ length: numTabs }, (_, i) => i),
                  outputRange: Array.from({ length: numTabs }, (_, i) => i * pillWidth + 4),
                }),
              }],
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 100,
    backgroundColor: 'rgba(180, 180, 180, 0.35)',
  },
});

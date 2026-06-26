import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
} from 'react-native';
import { EquipmentList } from './EquipmentList';
import { PriceList } from './PriceList';
import { ReviewsList } from './ReviewsList';
import type { PriceEntry, Review } from '@core/types/project';

type SectionKey = 'equipment' | 'priceList' | 'reviews';

const SECTIONS: { key: SectionKey; label: string; emoji: string; originFraction: number }[] = [
  { key: 'equipment', label: 'Equipment', emoji: '🎛️', originFraction: 1 / 6 },
  { key: 'priceList', label: 'Price List', emoji: '💰', originFraction: 1 / 2 },
  { key: 'reviews',   label: 'Reviews',    emoji: '⭐', originFraction: 5 / 6 },
];

type ContentTabsProps = {
  equipment: string[];
  priceList: PriceEntry[];
  reviews: Review[];
  isEditing: boolean;
  onEquipmentChange?: (items: string[]) => void;
  onPriceListChange?: (items: PriceEntry[]) => void;
};

export function ContentTabs({
  equipment,
  priceList,
  reviews,
  isEditing,
  onEquipmentChange,
  onPriceListChange,
}: ContentTabsProps) {
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [displayOpen, setDisplayOpen] = useState<SectionKey | null>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(0)).current;

  function originOffset(key: SectionKey) {
    const section = SECTIONS.find((s) => s.key === key)!;
    return (0.5 - section.originFraction) * panelWidth;
  }

  function runOpen(key: SectionKey) {
    scaleAnim.setValue(0);
    translateAnim.setValue(originOffset(key));
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function runClose(key: SectionKey, onDone: () => void) {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0,
        duration: 120,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateAnim, {
        toValue: originOffset(key),
        duration: 120,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }

  function toggle(key: SectionKey) {
    scaleAnim.stopAnimation();
    translateAnim.stopAnimation();

    if (open === key) {
      setOpen(null);
      runClose(key, () => setDisplayOpen(null));
    } else if (displayOpen === null) {
      setOpen(key);
      setDisplayOpen(key);
      runOpen(key);
    } else {
      const prev = displayOpen;
      setOpen(key);
      runClose(prev, () => {
        setDisplayOpen(key);
        runOpen(key);
      });
    }
  }

  return (
    <View style={styles.container}>
      <View
        style={styles.row}
        onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}
      >
        {SECTIONS.map((section) => {
          const isActive = open === section.key;
          return (
            <TouchableOpacity
              key={section.key}
              style={[
                styles.tab,
                { borderColor: isActive ? '#cb6ce6' : '#ffffff18' },
              ]}
              onPress={() => toggle(section.key)}
              activeOpacity={0.8}
            >
              <Text style={styles.tabEmoji}>{section.emoji}</Text>
              <Text style={[styles.tabLabel, { color: isActive ? '#cb6ce6' : 'rgba(255,255,255,0.5)' }]}>
                {section.label}
              </Text>
              <Text style={[styles.chevron, { color: isActive ? '#cb6ce6' : 'rgba(255,255,255,0.3)' }]}>
                {isActive ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {displayOpen && (
        <Animated.View
          style={[
            styles.panel,
            { borderColor: '#cb6ce6' },
            { transform: [{ scaleX: scaleAnim }, { translateX: translateAnim }] },
          ]}
        >
          {displayOpen === 'equipment' && (
            <EquipmentList items={equipment} isEditing={isEditing} onChange={onEquipmentChange} />
          )}
          {displayOpen === 'priceList' && (
            <PriceList items={priceList} isEditing={isEditing} onChange={onPriceListChange} />
          )}
          {displayOpen === 'reviews' && <ReviewsList reviews={reviews} />}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },

  row: {
    flexDirection: 'row',
    gap: 8,
  },

  tab: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderRadius: 14,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: '#12122a',
  },

  tabEmoji: { fontSize: 18 },
  tabLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  chevron: { fontSize: 9, fontWeight: '700' },

  panel: {
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: '#12122a',
    padding: 16,
  },
});

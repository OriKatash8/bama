import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
} from 'react-native';
import { EquipmentList } from './EquipmentList';
import { PriceList } from './PriceList';
import { ReviewsList } from './ReviewsList';
import { PortfolioGrid } from './PortfolioGrid';
import type { PriceEntry, Review } from '@core/types/project';
import type { MediaAsset } from '@core/types/media';

type SectionKey = 'equipment' | 'priceList' | 'reviews' | 'portfolio';

const SECTIONS: { key: SectionKey; label: string; emoji: string; originFraction: number }[] = [
  { key: 'equipment', label: 'Equipment', emoji: '🎛️', originFraction: 1 / 8 },
  { key: 'priceList', label: 'Price List', emoji: '💰', originFraction: 3 / 8 },
  { key: 'reviews',   label: 'Reviews',    emoji: '⭐', originFraction: 5 / 8 },
  { key: 'portfolio', label: 'Portfolio',  emoji: '🖼️', originFraction: 7 / 8 },
];

type ContentTabsProps = {
  equipment: string[];
  priceList: PriceEntry[];
  reviews: Review[];
  assets: MediaAsset[];
  isEditing: boolean;
  onEquipmentChange?: (items: string[]) => void;
  onPriceListChange?: (items: PriceEntry[]) => void;
  onPortfolioAdd?: (uri: string) => Promise<void>;
  onPortfolioRemove?: (assetId: string) => Promise<void>;
  onPortfolioError?: (message: string) => void;
};

export function ContentTabs({
  equipment,
  priceList,
  reviews,
  assets,
  isEditing,
  onEquipmentChange,
  onPriceListChange,
  onPortfolioAdd,
  onPortfolioRemove,
  onPortfolioError,
}: ContentTabsProps) {
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [displayOpen, setDisplayOpen] = useState<SectionKey | null>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(0)).current;
  const currentAnim = useRef<Animated.CompositeAnimation | null>(null);

  function originOffset(key: SectionKey) {
    const section = SECTIONS.find((s) => s.key === key)!;
    return (section.originFraction - 0.5) * panelWidth;
  }

  function runOpen(key: SectionKey) {
    scaleAnim.setValue(0);
    translateAnim.setValue(originOffset(key));
    currentAnim.current = Animated.parallel([
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
    ]);
    currentAnim.current.start();
  }

  function runClose(key: SectionKey, onDone: () => void) {
    currentAnim.current = Animated.parallel([
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
    ]);
    currentAnim.current.start(({ finished }) => {
      if (finished) onDone();
    });
  }

  function toggle(key: SectionKey) {
    currentAnim.current?.stop();

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
    <View style={[styles.container, { borderColor: open ? '#cb6ce6' : '#ffffff18' }]}>
      <View
        style={styles.row}
        onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}
      >
        {SECTIONS.map((section) => {
          const isActive = open === section.key;
          const tabScale = isActive ? 1.1 : open !== null ? 0.85 : 1;
          return (
            <TouchableOpacity
              key={section.key}
              style={[styles.tab, { transform: [{ scale: tabScale }] }]}
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
            displayOpen === 'portfolio' && styles.panelNoHPad,
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
          {displayOpen === 'portfolio' && (
            <PortfolioGrid
              assets={assets}
              isEditing={isEditing}
              onAdd={onPortfolioAdd}
              onRemove={onPortfolioRemove}
              onError={onPortfolioError}
            />
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1.5,
    borderRadius: 14,
    backgroundColor: '#12122a',
  },

  row: {
    flexDirection: 'row',
  },

  tab: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },

  tabEmoji: { fontSize: 18 },
  tabLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  chevron: { fontSize: 9, fontWeight: '700' },

  panel: {
    borderTopWidth: 1,
    borderTopColor: '#ffffff18',
    backgroundColor: '#12122a',
    padding: 16,
  },

  panelNoHPad: {
    paddingHorizontal: 0,
  },
});

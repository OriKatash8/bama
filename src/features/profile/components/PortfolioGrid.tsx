import { useState } from 'react';
import { View, Image, TouchableOpacity, Text, StyleSheet, Modal, Dimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { MediaAsset } from '@core/types/media';

// Screen padding from Screen component is 16 on each side; gap between tiles is 8
const TILE_SIZE = (Dimensions.get('window').width - 32 - 8) / 2;

type PortfolioGridProps = {
  assets: MediaAsset[];
  isEditing: boolean;
  onAdd?: (uri: string) => Promise<void>;
  onRemove?: (assetId: string) => Promise<void>;
};

export function PortfolioGrid({ assets, isEditing, onAdd, onRemove }: PortfolioGridProps) {
  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);

  async function handleAdd() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      quality: 0.9,
    });
    if (!result.canceled && onAdd) await onAdd(result.assets[0].uri);
  }

  return (
    <View>
      <View style={styles.grid}>
        {isEditing && (
          <TouchableOpacity style={[styles.tile, styles.addTile]} onPress={handleAdd} activeOpacity={0.8}>
            <Text style={styles.addIcon}>+</Text>
          </TouchableOpacity>
        )}
        {assets.map((asset) => (
          <TouchableOpacity
            key={asset.id}
            style={styles.tile}
            onPress={() => !isEditing && setFullscreenUri(asset.url)}
            activeOpacity={isEditing ? 1 : 0.9}
          >
            <Image source={{ uri: asset.url }} style={styles.image} />
            {isEditing && (
              <TouchableOpacity
                style={styles.deleteOverlay}
                onPress={() => onRemove?.(asset.id)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Text style={styles.deleteIcon}>×</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ))}
      </View>
      <Modal
        visible={!!fullscreenUri}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenUri(null)}
      >
        <TouchableOpacity
          style={styles.fullscreen}
          onPress={() => setFullscreenUri(null)}
          activeOpacity={1}
        >
          {fullscreenUri && (
            <Image
              source={{ uri: fullscreenUri }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  addIcon: { fontSize: 32, color: '#999' },
  image: { width: '100%', height: '100%' },
  deleteOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIcon: { color: '#fff', fontSize: 16, lineHeight: 20 },
  fullscreen: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImage: { width: '100%', height: '100%' },
});

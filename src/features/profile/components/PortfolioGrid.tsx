import { useState } from 'react';
import {
  View, Image, TouchableOpacity, Text, StyleSheet, Modal,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Play, ImagePlus } from 'lucide-react-native';
import { VideoPlayer } from '@components/ui/VideoPlayer';
import { useVideoUpload } from '@core/hooks/useVideoUpload';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { MediaAsset } from '@core/types/media';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

type PortfolioGridProps = {
  assets: MediaAsset[];
  isEditing: boolean;
  onAdd?: (uri: string) => Promise<void>;
  onAddVideo?: (url: string) => Promise<void>;
  onRemove?: (assetId: string) => Promise<void>;
  onError?: (message: string) => void;
};

export function PortfolioGrid({
  assets, isEditing, onAdd, onAddVideo, onRemove, onError,
}: PortfolioGridProps) {
  const user = useAuthStore((s) => s.user);
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);

  const [fullscreenAsset, setFullscreenAsset] = useState<MediaAsset | null>(null);
  const [tileSize, setTileSize] = useState(0);

  const { uploading: videoUploading, processing: videoProcessing, uploadVideo } = useVideoUpload();
  const videoActive = videoUploading || videoProcessing;

  // Log video assets whenever the portfolio changes
  const videoAssets = assets.filter((a) => a.type === 'video');
  if (videoAssets.length > 0) {
    videoAssets.forEach((a) => {
      const isCompressed = a.url.includes('_compressed');
      console.log(
        '[PortfolioGrid] video asset — id:', a.id,
        '| compressed:', isCompressed,
        '| url:', a.url
      );
    });
  }

  function handleGridLayout(width: number) {
    setTileSize((width - 8) / 2);
  }

  async function handleAddMedia() {
    if (!user) return;
    console.log('[PortfolioGrid] Add Media pressed — userId:', user.id);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'] as const,
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled) return;

    const asset = result.assets[0];

    if (asset.type === 'video') {
      try {
        const url = await uploadVideo('portfolio', user.id, asset);
        if (url && onAddVideo) await onAddVideo(url);
      } catch (e: unknown) {
        onError?.((e instanceof Error ? e.message : null) ?? t('media.video_error'));
      }
    } else {
      if (!onAdd) return;
      try {
        await onAdd(asset.uri);
      } catch (e: unknown) {
        onError?.((e instanceof Error ? e.message : null) ?? 'Failed to upload photo');
      }
    }
  }

  return (
    <View>
      {/* Processing indicator */}
      {videoActive && (
        <View style={styles.processingRow}>
          <ActivityIndicator size="small" color="#cb6ce6" />
          <Text style={styles.processingText}>
            {videoUploading ? 'Uploading...' : t('media.processing_video')}
          </Text>
        </View>
      )}

      <View style={styles.grid} onLayout={(e) => handleGridLayout(e.nativeEvent.layout.width)}>
        {isEditing && (
          <TouchableOpacity
            style={[styles.tile, styles.addTile, { width: tileSize, height: tileSize }]}
            onPress={handleAddMedia}
            disabled={videoActive}
            activeOpacity={0.8}
          >
            <ImagePlus size={28} color="#cb6ce6" strokeWidth={1.5} />
            <Text style={styles.addMediaLabel}>{t('profile_sections.add_media')}</Text>
          </TouchableOpacity>
        )}

        {assets.map((asset) => (
          <TouchableOpacity
            key={asset.id}
            style={[styles.tile, { width: tileSize, height: tileSize }]}
            onPress={() => !isEditing && setFullscreenAsset(asset)}
            activeOpacity={isEditing ? 1 : 0.9}
          >
            {asset.type === 'video' ? (
              <View style={[StyleSheet.absoluteFill, styles.videoThumb]}>
                <Play size={28} color="#fff" fill="#fff" />
              </View>
            ) : (
              <Image source={{ uri: asset.url }} style={styles.image} />
            )}
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

      {/* Fullscreen modal — image or video */}
      <Modal
        visible={!!fullscreenAsset}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenAsset(null)}
      >
        <TouchableOpacity
          style={styles.fullscreen}
          onPress={() => setFullscreenAsset(null)}
          activeOpacity={1}
        >
          {fullscreenAsset?.type === 'video' ? (
            <VideoPlayer
              uri={fullscreenAsset.url}
              style={styles.fullscreenVideo}
            />
          ) : fullscreenAsset ? (
            <Image
              source={{ uri: fullscreenAsset.url }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          ) : null}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffffff33',
    borderStyle: 'dashed',
  },
  addMediaLabel: { fontSize: 11, color: '#cb6ce6', fontWeight: '600', marginTop: 6 },
  image: { width: '100%', height: '100%' },
  videoThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a1a',
  },
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
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  processingText: {
    fontSize: 13,
    color: '#cb6ce6',
    fontWeight: '500',
  },
  fullscreen: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImage: { width: '100%', height: '100%' },
  fullscreenVideo: {
    width: '100%',
    height: 300,
  },
});

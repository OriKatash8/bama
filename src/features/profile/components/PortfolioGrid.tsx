import { useState } from 'react';
import {
  View, Image, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AppText } from '@components/ui/AppText';
import * as ImagePicker from 'expo-image-picker';
import { Play, ImagePlus } from 'lucide-react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useVideoUpload } from '@core/hooks/useVideoUpload';
import { PortfolioViewer } from './PortfolioViewer';
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

function VideoThumbTile({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.pause();
  });
  const [ready, setReady] = useState(false);

  return (
    <>
      {!ready && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0a0a1a' }]} />}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => setReady(true)}
      />
    </>
  );
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

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
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
          <AppText style={styles.processingText}>
            {videoUploading ? 'Uploading...' : t('media.processing_video')}
          </AppText>
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
            <ImagePlus size={28} color="#004aad" strokeWidth={1.5} />
            <AppText style={styles.addMediaLabel}>{t('profile_sections.add_media')}</AppText>
          </TouchableOpacity>
        )}

        {assets.map((asset) => (
          <TouchableOpacity
            key={asset.id}
            style={[styles.tile, { width: tileSize, height: tileSize }]}
            onPress={() => !isEditing && setViewerIndex(assets.indexOf(asset))}
            activeOpacity={isEditing ? 1 : 0.9}
          >
            {asset.type === 'video' ? (
              <>
                <VideoThumbTile uri={asset.url} />
                <View style={[StyleSheet.absoluteFill, styles.videoThumb]}>
                  <Play size={28} color="#fff" fill="#fff" />
                </View>
              </>
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

      <PortfolioViewer
        assets={assets}
        initialIndex={viewerIndex ?? 0}
        visible={viewerIndex !== null}
        onClose={() => setViewerIndex(null)}
      />
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
    borderWidth: 1.5,
    borderColor: '#004aad',
    borderStyle: 'dashed',
    backgroundColor: '#fff',
  },
  addMediaLabel: { fontSize: 11, color: '#004aad', fontWeight: '600', marginTop: 6 },
  image: { width: '100%', height: '100%' },
  videoThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
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
});

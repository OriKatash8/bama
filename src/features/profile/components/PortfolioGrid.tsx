import { useState } from 'react';
import {
  View, Image, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator, TextInput,
} from 'react-native';
import { AppText } from '@components/ui/AppText';
import { useAppFont } from '@core/hooks/useAppFont';
import * as ImagePicker from 'expo-image-picker';
import { Play, ImagePlus } from 'lucide-react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useVideoUpload } from '@core/hooks/useVideoUpload';
import { PortfolioViewer } from './PortfolioViewer';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { CAPTION_MAX_LENGTH, type MediaAsset } from '@core/types/media';

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
  onAdd?: (uri: string, caption: string | null) => Promise<void>;
  onAddVideo?: (url: string, caption: string | null) => Promise<void>;
  onRemove?: (assetId: string) => Promise<void>;
  onError?: (message: string) => void;
};

// What the picker handed back, held whole while the author writes its caption —
// uploadVideo reads more than the uri off it.
type PendingMedia = { asset: ImagePicker.ImagePickerAsset; isVideo: boolean };

export function PortfolioGrid({
  assets, isEditing, onAdd, onAddVideo, onRemove, onError,
}: PortfolioGridProps) {
  const user = useAuthStore((s) => s.user);
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [tileSize, setTileSize] = useState(0);
  const [pending, setPending] = useState<PendingMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);

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

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'] as const,
        allowsEditing: false,
        quality: 1,
        // A non-passthrough preset skips PHPicker's writeData fast-path (which streams the huge
        // full-size iCloud original and stalls the upload) and instead loads + transcodes to 720p.
        // loadVideoRepresentation auto-downloads iCloud-offloaded videos → also fixes PHPhotos 3164.
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      });
    } catch (e: unknown) {
      // iOS can throw here (e.g. PHPhotosErrorDomain 3164) when it can't export the
      // selected video — typically an iCloud-only video that isn't downloaded locally.
      console.warn('[PortfolioGrid] image picker failed:', e);
      onError?.((e instanceof Error ? e.message : null) ?? t('media.video_pick_error'));
      return;
    }
    if (result.canceled) return;

    // Hold the pick and ask for a caption first — this is the only moment the
    // author gets to describe the work for the clients who will open it.
    const asset = result.assets[0];
    setCaption('');
    setPending({ asset, isVideo: asset.type === 'video' });
  }

  async function commitPending(withCaption: string | null) {
    if (!user || !pending) return;
    setSaving(true);
    try {
      if (pending.isVideo) {
        const url = await uploadVideo('portfolio', user.id, pending.asset);
        if (url && onAddVideo) await onAddVideo(url, withCaption);
      } else if (onAdd) {
        await onAdd(pending.asset.uri, withCaption);
      }
      setPending(null);
      setCaption('');
    } catch (e: unknown) {
      const fallback = pending.isVideo ? t('media.video_error') : 'Failed to upload photo';
      onError?.((e instanceof Error ? e.message : null) ?? fallback);
      // Keep the sheet open so the typed caption survives a retry
    } finally {
      setSaving(false);
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

      {/* Caption sheet — the one moment the author can describe this piece. */}
      {pending && (
        <View style={styles.captionOverlay}>
          <View style={styles.captionSheet}>
            <AppText weight="bold" style={[styles.captionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('media.caption_title')}
            </AppText>
            <AppText weight="regular" style={[styles.captionBody, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('media.caption_body')}
            </AppText>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder={t('media.caption_placeholder')}
              placeholderTextColor="#9aa0b8"
              maxLength={CAPTION_MAX_LENGTH}
              multiline
              editable={!saving}
              style={[styles.captionInput, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
              textAlign={rtl ? 'right' : 'left'}
              testID="caption-input"
            />
            <View style={[styles.captionActions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity
                style={[styles.captionBtn, styles.captionBtnSkip]}
                onPress={() => commitPending(null)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={t('media.caption_skip')}
              >
                <AppText weight="semiBold" style={styles.captionBtnSkipText}>
                  {t('media.caption_skip')}
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.captionBtn, styles.captionBtnSave]}
                onPress={() => commitPending(caption.trim() || null)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={t('media.caption_save')}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : (
                    <AppText weight="semiBold" style={styles.captionBtnSaveText}>
                      {t('media.caption_save')}
                    </AppText>
                  )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
  captionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,26,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  captionSheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
    shadowColor: '#1e4fa3',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  captionTitle: { fontSize: 17, color: '#004aad' },
  captionBody: { fontSize: 13, color: '#6b7280', marginTop: 6 },
  captionInput: {
    marginTop: 12,
    minHeight: 84,
    borderWidth: 1,
    borderColor: '#e3e7f2',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#1a1a2e',
    textAlignVertical: 'top',
  },
  captionActions: { marginTop: 14, gap: 10 },
  captionBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionBtnSkip: { backgroundColor: '#f1f3f9' },
  captionBtnSkipText: { color: '#6b7280', fontSize: 15 },
  captionBtnSave: { backgroundColor: '#004aad' },
  captionBtnSaveText: { color: '#fff', fontSize: 15 },
});

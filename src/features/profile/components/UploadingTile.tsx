import { View, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { Film } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { videoStageLabel } from '@components/ui/VideoUploadStatus';
import type { VideoUploadStage } from '@core/hooks/useVideoUpload';

type Props = {
  uri: string;
  isVideo: boolean;
  stage: VideoUploadStage;
  /** 0..1 within the compress / upload stage. */
  progress: number;
  /** Processing outlasted the client timeout; the job may still finish. */
  slow?: boolean;
  /** The run failed: show the error and Retry instead of progress. */
  failed?: boolean;
  /** The one cancel control: stops the work in any stage, or dismisses a failed tile. */
  onCancel: () => void;
  onRetry?: () => void;
  size: number;
  accent: string;
  rtl: boolean;
  t: (key: string) => string;
};

/**
 * The grid tile for the item being added: what it is, which stage it is in, how far along,
 * and an X. Used for photos and videos alike, in every stage.
 */
export function UploadingTile({
  uri, isVideo, stage, progress, slow, failed, onCancel, onRetry, size, accent, rtl, t,
}: Props) {
  const determinate = stage === 'uploading' || (stage === 'compressing' && progress > 0);
  const label = failed
    ? t('media.video_upload_failed')
    : slow && stage === 'processing'
      ? t('media.video_processing_slow')
      : videoStageLabel(stage, progress, t);

  return (
    <View style={[styles.tile, { width: size, height: size }]} testID="uploading-tile">
      {isVideo ? (
        <View style={[StyleSheet.absoluteFill, styles.videoBg]}>
          <Film size={30} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />
        </View>
      ) : (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} />
      )}
      <View style={[StyleSheet.absoluteFill, styles.dim]} />

      <View style={styles.center}>
        {!failed && !determinate && <ActivityIndicator size="small" color="#fff" />}
        <AppText
          weight="semiBold"
          style={[styles.label, { textAlign: 'center' }]}
          numberOfLines={slow ? 4 : 2}
          testID="uploading-tile-label"
        >
          {label}
        </AppText>
        {failed && onRetry && (
          <TouchableOpacity
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={t('media.video_retry')}
            style={[styles.retry, { borderColor: '#fff' }]}
            testID="uploading-tile-retry"
          >
            <AppText weight="semiBold" style={styles.retryText}>{t('media.video_retry')}</AppText>
          </TouchableOpacity>
        )}
      </View>

      {determinate && !failed && (
        <View style={[styles.track, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <View
            style={[styles.fill, { backgroundColor: accent, width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }]}
            testID="uploading-tile-fill"
          />
        </View>
      )}

      <TouchableOpacity
        onPress={onCancel}
        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        accessibilityRole="button"
        accessibilityLabel={t('media.video_cancel')}
        style={[styles.x, rtl ? { left: 6 } : { right: 6 }]}
        testID="uploading-tile-cancel"
      >
        <Text style={styles.xIcon}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#0a0a1a' },
  videoBg: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#14142b' },
  dim: { backgroundColor: 'rgba(10,10,26,0.55)' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 },
  label: { color: '#fff', fontSize: 12 },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  fill: { height: 4 },
  x: {
    position: 'absolute',
    top: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  xIcon: { color: '#fff', fontSize: 20, lineHeight: 22 },
  retry: { borderWidth: 1, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 12 },
  retryText: { color: '#fff', fontSize: 12 },
});

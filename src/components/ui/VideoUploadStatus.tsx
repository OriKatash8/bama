import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AppText } from '@components/ui/AppText';
import type { VideoUploadStage } from '@core/hooks/useVideoUpload';

type Props = {
  stage: VideoUploadStage;
  /** 0..1 within the compress / upload stage. */
  progress: number;
  /** Processing outlasted the client timeout; the job may still finish. */
  slow?: boolean;
  /** Set after a failed run; shows the message and a retry button. */
  error?: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
  accent: string;
  rtl: boolean;
  t: (key: string) => string;
  /** Text colour; the surface differs between the portfolio and the chat input bar. */
  color?: string;
};

/** The label for a stage, with the percentage appended while one is known. */
export function videoStageLabel(
  stage: VideoUploadStage,
  progress: number,
  t: (key: string) => string
): string {
  const pct = `${Math.round(progress * 100)}%`;
  if (stage === 'compressing') return progress > 0 ? `${t('media.video_compressing')} ${pct}` : t('media.video_compressing');
  if (stage === 'uploading') return `${t('media.video_uploading')} ${pct}`;
  return t('media.video_processing');
}

/**
 * Two-stage video progress: "מכווץ סרטון…" → "מעלה… 42%" → "מעבד…", with Cancel.
 * After a failure it shows the error with a retry button instead. RTL: the bar fills
 * from the right and the row order flips.
 */
export function VideoUploadStatus({
  stage, progress, slow, error, onCancel, onRetry, accent, rtl, t, color = '#000000',
}: Props) {
  const dir = rtl ? 'row-reverse' : 'row';
  const align = rtl ? 'right' : 'left';

  if (error && stage === 'idle') {
    return (
      <View style={styles.wrap} testID="video-upload-error">
        <AppText style={[styles.text, { color, textAlign: align }]}>{t('media.video_upload_failed')}</AppText>
        {onRetry && (
          <TouchableOpacity
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={t('media.video_retry')}
            style={[styles.btn, { borderColor: accent, alignSelf: rtl ? 'flex-end' : 'flex-start' }]}
            testID="video-upload-retry"
          >
            <AppText weight="semiBold" style={[styles.btnText, { color: accent }]}>{t('media.video_retry')}</AppText>
          </TouchableOpacity>
        )}
      </View>
    );
  }
  if (stage === 'idle') return null;

  const determinate = stage === 'uploading' || (stage === 'compressing' && progress > 0);
  return (
    <View style={styles.wrap} testID="video-upload-status">
      <View style={[styles.row, { flexDirection: dir }]}>
        {!determinate && <ActivityIndicator size="small" color={accent} />}
        <AppText style={[styles.text, { color, textAlign: align, flex: 1 }]} testID="video-upload-label">
          {videoStageLabel(stage, progress, t)}
        </AppText>
        {onCancel && (
          <TouchableOpacity
            onPress={onCancel}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('media.video_cancel')}
            testID="video-upload-cancel"
          >
            <AppText weight="semiBold" style={[styles.btnText, { color: accent }]}>{t('media.video_cancel')}</AppText>
          </TouchableOpacity>
        )}
      </View>
      {determinate && (
        <View style={[styles.track, { flexDirection: dir }]} testID="video-upload-track">
          <View
            style={[styles.fill, { backgroundColor: accent, width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }]}
            testID="video-upload-fill"
          />
        </View>
      )}
      {stage === 'processing' && slow && (
        <AppText style={[styles.hint, { color, textAlign: align }]} testID="video-upload-slow">
          {t('media.video_processing_slow')}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 8, paddingHorizontal: 4, gap: 6 },
  row: { alignItems: 'center', gap: 8 },
  text: { fontSize: 13, fontWeight: '500' },
  hint: { fontSize: 12, opacity: 0.7 },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.25)', overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  btn: { borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 },
  btnText: { fontSize: 13 },
});

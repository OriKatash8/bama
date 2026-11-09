import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { X } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { VideoPlayer } from '@components/ui/VideoPlayer';
import type { PendingStage } from '../hooks/useChatMediaSend';

type Props = {
  type: 'image' | 'video';
  uri: string;
  stage: PendingStage;
  /** 0..1 */
  progress: number;
  failed: boolean;
  onCancel: () => void;
  onRetry: () => void;
  t: (key: string) => string;
};

const SIZE = 52;
const STROKE = 4;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/** Ring that fills with `progress`; spins as a static partial arc while the length is unknown. */
function Ring({ progress }: { progress: number }) {
  const shown = Math.max(0.08, Math.min(1, progress));
  return (
    <Svg width={SIZE} height={SIZE} testID="pending-ring">
      <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="rgba(255,255,255,0.35)" strokeWidth={STROKE} fill="none" />
      <Circle
        cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="#ffffff" strokeWidth={STROKE} fill="none"
        strokeDasharray={`${C}`} strokeDashoffset={C * (1 - shown)} strokeLinecap="round"
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
      />
    </Svg>
  );
}

function label(stage: PendingStage, t: Props['t']): string {
  if (stage === 'compressing') return t('media.video_compressing');
  if (stage === 'processing') return t('media.video_processing');
  if (stage === 'uploading') return t('media.video_uploading');
  return t('chats.media_preparing');
}

/** The inside of an own-message bubble for a media send that has not landed yet. */
export function PendingMediaBubble({ type, uri, stage, progress, failed, onCancel, onRetry, t }: Props) {
  return (
    <View style={styles.box} testID="pending-media">
      {type === 'video'
        ? <VideoPlayer uri={uri} style={styles.fill} thumbnailOnly />
        : <Image source={{ uri }} style={styles.fill} resizeMode="cover" />}
      <View style={styles.overlay}>
        {failed ? (
          <>
            <AppText style={styles.text}>{t('media.video_upload_failed')}</AppText>
            <View style={styles.actions}>
              <TouchableOpacity onPress={onRetry} style={[styles.btn, { borderColor: '#fff' }]} accessibilityRole="button" testID="pending-retry">
                <AppText weight="semiBold" style={styles.btnText}>{t('media.video_retry')}</AppText>
              </TouchableOpacity>
              <TouchableOpacity onPress={onCancel} style={[styles.btn, { borderColor: '#fff' }]} accessibilityRole="button" testID="pending-dismiss">
                <AppText weight="semiBold" style={styles.btnText}>{t('media.video_cancel')}</AppText>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.ringWrap}>
              <Ring progress={progress} />
              <TouchableOpacity
                onPress={onCancel}
                style={styles.cancel}
                accessibilityRole="button"
                accessibilityLabel={t('media.video_cancel')}
                testID="pending-cancel"
                hitSlop={8}
              >
                <X size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            <AppText style={styles.text}>
              {label(stage, t)}{progress > 0 && stage !== 'processing' ? ` ${Math.round(progress * 100)}%` : ''}
            </AppText>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', aspectRatio: 1, backgroundColor: '#111' },
  fill: { ...StyleSheet.absoluteFill },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  ringWrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  cancel: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontSize: 13, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  btnText: { color: '#fff', fontSize: 13 },
});

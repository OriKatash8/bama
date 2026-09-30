import { StyleSheet } from 'react-native';
import { VideoPlayer } from '@components/ui/VideoPlayer';
import { useMediaRatio } from '../utils/mediaRatio';

/**
 * A video message's thumbnail in the video's own shape, like ChatImage. It was
 * a fixed 16:9 box, so a vertical video sat small in the middle of it.
 *
 * The size comes from the player's video track. That is the raw frame size —
 * rotation metadata is not applied — but chat videos are the server's
 * re-encoded copy (compressVideo; ffmpeg applies the rotation), so a vertical
 * video's frame is vertical.
 */
export function ChatVideo({ uri }: { uri: string }) {
  const [ratio, setSize] = useMediaRatio(uri, 16 / 9);
  return (
    <VideoPlayer
      uri={uri}
      style={StyleSheet.flatten([styles.video, { aspectRatio: ratio }])}
      thumbnailOnly
      onVideoSize={({ width, height }) => setSize(width, height)}
    />
  );
}

const styles = StyleSheet.create({
  video: { width: '100%', minHeight: 0 },
});

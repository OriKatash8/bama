import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Camera, Clock } from 'lucide-react-native';
import type { ReceiptStatus } from '../utils/readReceipts';

/** The timestamp's own tone on an own (coloured) bubble. */
const MUTED = 'rgba(255,255,255,0.7)';
const SEEN = '#FFFFFF';

// lucide's camera, so the three states share one silhouette.
const CAMERA_BODY = 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z';

type Props = {
  status: ReceiptStatus;
  /** The bubble's own fill. The seen camera's lens is cut out in this colour, so
   *  it reads as a camera and not as a white blob. */
  bubbleColor: string;
  size?: number;
  /** Spoken label for each state. */
  labels: Record<ReceiptStatus, string>;
};

/**
 * Status of one of MY messages in a project / marketplace chat:
 * clock = not yet confirmed by the server, outline camera = sent, filled camera = seen
 * by everyone else. Shown in tones of white because own bubbles are filled with the
 * mode colour — a gray or blue icon would vanish on them.
 */
export function ReadReceiptIcon({ status, bubbleColor, size = 13, labels }: Props) {
  return (
    <View
      testID={`read-receipt-${status}`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={labels[status]}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {status === 'sending' ? (
        <Clock size={size} color={MUTED} strokeWidth={2} />
      ) : status === 'sent' ? (
        <Camera size={size} color={MUTED} strokeWidth={2} />
      ) : (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={CAMERA_BODY} fill={SEEN} stroke={SEEN} strokeWidth={2} strokeLinejoin="round" />
          {/* The lens: a hole in the bubble colour with a white ring, so the camera keeps its eye. */}
          <Circle cx={12} cy={13} r={3.6} fill={bubbleColor} stroke={SEEN} strokeWidth={1.4} />
        </Svg>
      )}
    </View>
  );
}

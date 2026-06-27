import Svg, { Rect, Circle, Path } from 'react-native-svg';

const BG = '#e8f0fe';
const ICON = '#004aad';
const SIZE = 52;
const R = 14;

export function AllIcon() {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 52 52">
      <Rect x="2" y="2" width="48" height="48" rx={R} ry={R} fill={BG} />
      {/* 2x2 grid of rounded squares */}
      <Rect x="11" y="11" width="12" height="12" rx="3" ry="3" fill={ICON} />
      <Rect x="29" y="11" width="12" height="12" rx="3" ry="3" fill={ICON} />
      <Rect x="11" y="29" width="12" height="12" rx="3" ry="3" fill={ICON} />
      <Rect x="29" y="29" width="12" height="12" rx="3" ry="3" fill={ICON} />
    </Svg>
  );
}

export function LensIcon() {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 52 52">
      {/* Background rounded square */}
      <Rect x="2" y="2" width="48" height="48" rx={R} ry={R} fill={BG} />
      {/* Outer lens ring */}
      <Circle cx="26" cy="26" r="16" fill="none" stroke={ICON} strokeWidth="3.5" />
      {/* Middle ring */}
      <Circle cx="26" cy="26" r="10" fill="none" stroke={ICON} strokeWidth="2.5" />
      {/* Inner glass */}
      <Circle cx="26" cy="26" r="5" fill={ICON} />
      {/* Highlight */}
      <Circle cx="23" cy="23" r="1.5" fill={BG} opacity="0.7" />
    </Svg>
  );
}

export function MoreIcon() {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 52 52">
      {/* Background rounded square */}
      <Rect x="2" y="2" width="48" height="48" rx={R} ry={R} fill={BG} />
      {/* Three dots */}
      <Circle cx="15" cy="26" r="4.5" fill={ICON} />
      <Circle cx="26" cy="26" r="4.5" fill={ICON} />
      <Circle cx="37" cy="26" r="4.5" fill={ICON} />
    </Svg>
  );
}

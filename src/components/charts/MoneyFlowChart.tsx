import { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Path, Line, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { AppText } from '@components/ui/AppText';

type Props = {
  data: number[];
  labels: string[];
  variant?: 'area' | 'bar';
  /** Line/bar color. */
  color: string;
  gridColor: string;
  labelColor: string;
  height?: number;
};

/**
 * Minimal SVG chart (no chart dependency — react-native-svg only, web-safe).
 * Degrades gracefully to an empty-but-legible frame when all values are 0:
 * the gridlines, a flat baseline (area) or faint tracks (bar), and the x-axis
 * labels still render, so it reads as "chart, currently zero" rather than blank.
 */
export function MoneyFlowChart({
  data, labels, variant = 'area', color, gridColor, labelColor, height = 140,
}: Props) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const padX = 8;
  const padT = 10;
  const padB = 8;
  const innerW = Math.max(0, w - padX * 2);
  const innerH = height - padT - padB;
  const n = data.length;
  const max = Math.max(1, ...data); // guard: all-zero → flat baseline, no divide-by-zero

  const xLine = (i: number) => padX + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const yOf = (v: number) => padT + innerH - (v / max) * innerH;
  const baseY = padT + innerH;

  // Horizontal gridlines at 0 / 50 / 100%.
  const gridYs = [padT, padT + innerH / 2, baseY];

  // Area/line paths.
  const pts = data.map((v, i) => `${xLine(i)},${yOf(v)}`);
  const lineD = n > 0 ? `M ${pts.join(' L ')}` : '';
  const areaPath = n > 0 ? `M ${xLine(0)},${baseY} L ${pts.join(' L ')} L ${xLine(n - 1)},${baseY} Z` : '';

  // Bar geometry (band scale).
  const bandW = n > 0 ? innerW / n : 0;
  const barW = bandW * 0.55;

  return (
    <View>
      <View onLayout={onLayout} style={{ height }}>
        {w > 0 && (
          <Svg width={w} height={height}>
            <Defs>
              <LinearGradient id="mfArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.28} />
                <Stop offset="1" stopColor={color} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>

            {gridYs.map((gy, i) => (
              <Line key={i} x1={padX} y1={gy} x2={padX + innerW} y2={gy} stroke={gridColor} strokeWidth={1} />
            ))}

            {variant === 'area' ? (
              <>
                {max > 1 && <Path d={areaPath} fill="url(#mfArea)" />}
                <Path d={lineD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </>
            ) : (
              <>
                {/* faint full-height tracks so empty bars stay visible */}
                {data.map((_, i) => {
                  const x = padX + i * bandW + (bandW - barW) / 2;
                  return <Rect key={`t${i}`} x={x} y={padT} width={barW} height={innerH} rx={4} fill={gridColor} opacity={0.5} />;
                })}
                {data.map((v, i) => {
                  const h = (v / max) * innerH;
                  if (h <= 0) return null;
                  const x = padX + i * bandW + (bandW - barW) / 2;
                  return <Rect key={`b${i}`} x={x} y={baseY - h} width={barW} height={h} rx={4} fill={color} />;
                })}
              </>
            )}
          </Svg>
        )}
      </View>

      {/* x-axis labels (RN text — correct font + RTL, no SVG text quirks) */}
      <View style={styles.labels}>
        {labels.map((l, i) => (
          <AppText key={i} weight="regular" numberOfLines={1} style={[styles.label, { color: labelColor }]}>
            {l}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', marginTop: 4, paddingHorizontal: 8 },
  label: { flex: 1, fontSize: 9, textAlign: 'center' },
});

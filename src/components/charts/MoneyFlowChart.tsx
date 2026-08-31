import { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Path, Line, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { AppText } from '@components/ui/AppText';

type Series = { color: string; data: number[] };

type Props = {
  labels: string[];
  gridColor: string;
  labelColor: string;
  height?: number;
  /** Single-series mode. */
  data?: number[];
  variant?: 'area' | 'bar';
  color?: string;
  /** Stacked mode — one entry per source, rendered as stacked bars per bucket. */
  series?: Series[];
};

/**
 * Minimal SVG chart (no chart dependency — react-native-svg only, web-safe).
 * Supports a single-series area/bar, or a `series` stack (bars split by source).
 * Degrades gracefully to an empty-but-legible frame when everything is 0: the
 * gridlines, faint full-height bucket tracks, and x-axis labels still render.
 */
export function MoneyFlowChart({
  labels, gridColor, labelColor, height = 140,
  data, variant = 'area', color = '#004aad', series,
}: Props) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const padX = 8;
  const padT = 10;
  const padB = 8;
  const innerW = Math.max(0, w - padX * 2);
  const innerH = height - padT - padB;
  const baseY = padT + innerH;

  const stacked = !!series && series.length > 0;
  const n = labels.length;

  // Scale: stack totals per bucket (stacked) or the single series (guard all-zero).
  const bucketTotals = stacked ? labels.map((_, i) => series!.reduce((s, ser) => s + (ser.data[i] ?? 0), 0)) : (data ?? []);
  const max = Math.max(1, ...bucketTotals);

  const xLine = (i: number) => padX + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const yOf = (v: number) => padT + innerH - (v / max) * innerH;
  const gridYs = [padT, padT + innerH / 2, baseY];

  // Single-series area/line paths.
  const pts = (data ?? []).map((v, i) => `${xLine(i)},${yOf(v)}`);
  const lineD = pts.length > 0 ? `M ${pts.join(' L ')}` : '';
  const areaPath = pts.length > 0 ? `M ${xLine(0)},${baseY} L ${pts.join(' L ')} L ${xLine(pts.length - 1)},${baseY} Z` : '';

  // Bar geometry (band scale).
  const bandW = n > 0 ? innerW / n : 0;
  const barW = bandW * 0.55;
  const barX = (i: number) => padX + i * bandW + (bandW - barW) / 2;

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
              <Line key={`g${i}`} x1={padX} y1={gy} x2={padX + innerW} y2={gy} stroke={gridColor} strokeWidth={1} />
            ))}

            {/* faint full-height tracks so empty buckets stay visible (bar/stacked) */}
            {(stacked || variant === 'bar') &&
              labels.map((_, i) => (
                <Rect key={`t${i}`} x={barX(i)} y={padT} width={barW} height={innerH} rx={4} fill={gridColor} opacity={0.5} />
              ))}

            {stacked ? (
              // Stacked segments per bucket, bottom-up.
              labels.map((_, i) => {
                let cursor = baseY;
                return series!.map((ser, k) => {
                  const h = ((ser.data[i] ?? 0) / max) * innerH;
                  if (h <= 0) return null;
                  const y = cursor - h;
                  cursor = y;
                  return <Rect key={`s${i}-${k}`} x={barX(i)} y={y} width={barW} height={h} rx={2} fill={ser.color} />;
                });
              })
            ) : variant === 'area' ? (
              <>
                {max > 1 && <Path d={areaPath} fill="url(#mfArea)" />}
                <Path d={lineD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </>
            ) : (
              (data ?? []).map((v, i) => {
                const h = (v / max) * innerH;
                if (h <= 0) return null;
                return <Rect key={`b${i}`} x={barX(i)} y={baseY - h} width={barW} height={h} rx={4} fill={color} />;
              })
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

import { useId, useState } from 'react';
import { Platform, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useAdminPalette, useAdminT } from '../i18n';
import { MOTION } from '../theme';
import {
  FLOW_H as H,
  FLOW_INSETS as I,
  areaPath,
  flowNiceMax,
  gridValues,
  linePath,
  nearestIndex,
  pathLength,
  xAt,
  xLabelIndices,
  yAt,
  type Pt,
} from '../chartGeometry';
import { stepAt, useTimeline } from '../motion';
import { ChartCard, EmptyPlot, Legend, Ltr, Tooltip, XLabel, YLabels } from './ChartParts';

export function formatDay(d: Date, lang: 'he' | 'en'): string {
  return lang === 'he'
    ? `${d.getDate()}.${d.getMonth() + 1}`
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Joins (series1) and exits (series2) per day over the range: two 2px lines
 * over 22%→0 gradient fills, ringed endpoint dots, 4 grid lines, ~5 dates.
 * Hover (web) or touch shows a crosshair and a card with both values.
 *
 * Always left-to-right. Nothing is drawn until the width is known. With no
 * joins or leaves in the range it draws the empty axes and says so, rather
 * than a flat line that would claim "zero" for days the log never saw.
 */
export function MemberFlowChart({
  days,
  joins,
  exits,
  range,
  style,
}: {
  days: Date[];
  joins: number[];
  exits: number[];
  range: number;
  style?: object;
}) {
  const p = useAdminPalette();
  const { t, lang } = useAdminT();
  const [w, setW] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const elapsed = useTimeline(MOTION.lineDraw, range);
  const drawn = stepAt(elapsed, 0, MOTION.lineDraw);

  const n = days.length;
  const totalJ = joins.reduce((a, b) => a + b, 0);
  const totalE = exits.reduce((a, b) => a + b, 0);
  const empty = totalJ + totalE === 0;
  const niceMax = flowNiceMax(empty ? [] : [...joins, ...exits]);
  const base = H - I.bottom;
  const pts = (vals: number[]): Pt[] => vals.map((v, i) => [xAt(i, n, w, I), yAt(v, niceMax, H, I)]);
  const series = [
    { key: 'j', color: p.series1, label: t('series_joined'), values: joins, pts: pts(joins) },
    { key: 'e', color: p.series2, label: t('series_left'), values: exits, pts: pts(exits) },
  ];
  const shownActive = active !== null && active < n && !empty ? active : null;

  const pick = (px: number) => setActive(nearestIndex(px, n, w, I));
  const hit = {
    onStartShouldSetResponder: () => true,
    onResponderGrant: (e: GestureResponderEvent) => pick(e.nativeEvent.locationX),
    onResponderMove: (e: GestureResponderEvent) => pick(e.nativeEvent.locationX),
    // Let the page scroll take over a vertical drag.
    onResponderTerminationRequest: () => true,
    onResponderTerminate: () => setActive(null),
    ...(Platform.OS === 'web'
      ? {
          onPointerMove: (e: { nativeEvent: { offsetX: number } }) => pick(e.nativeEvent.offsetX),
          onPointerLeave: () => setActive(null),
        }
      : null),
  };

  return (
    <ChartCard title={t('flow_title')} sub={t('flow_sub', { n: range })} style={style} testID="flow-chart">
      <Legend items={series.map((s) => ({ color: s.color, label: s.label }))} />
      <View style={styles.body}>
        <Ltr>
          <View
            style={styles.plot}
            onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('flow_a11y', { n: range, joins: totalJ, exits: totalE })}
            testID="flow-plot"
          >
            {w > 0 && (
              <>
                <Svg width={w} height={H}>
                  <Defs>
                    {series.map((s) => (
                      <LinearGradient key={s.key} id={`${uid}${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={s.color} stopOpacity={0.22} />
                        <Stop offset="1" stopColor={s.color} stopOpacity={0} />
                      </LinearGradient>
                    ))}
                  </Defs>
                  {gridValues(niceMax).map((v) => (
                    <Line
                      key={v}
                      x1={I.left}
                      x2={w - I.right}
                      y1={yAt(v, niceMax, H, I)}
                      y2={yAt(v, niceMax, H, I)}
                      stroke={p.gridLine}
                      strokeWidth={1}
                    />
                  ))}
                  {!empty &&
                    series.map((s) => {
                      const len = pathLength(s.pts);
                      const end = s.pts[s.pts.length - 1];
                      return (
                        <G key={s.key}>
                          <Path d={areaPath(s.pts, base)} fill={`url(#${uid}${s.key})`} opacity={drawn} />
                          <Path
                            testID={`flow-line-${s.key}`}
                            d={linePath(s.pts)}
                            fill="none"
                            stroke={s.color}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            {...(len > 0 ? { strokeDasharray: `${len} ${len}`, strokeDashoffset: len * (1 - drawn) } : null)}
                          />
                          {end && <Circle cx={end[0]} cy={end[1]} r={4} fill={s.color} stroke={p.surface} strokeWidth={2} />}
                        </G>
                      );
                    })}
                  {shownActive !== null && (
                    <>
                      <Line
                        testID="flow-crosshair"
                        x1={xAt(shownActive, n, w, I)}
                        x2={xAt(shownActive, n, w, I)}
                        y1={I.top}
                        y2={base}
                        stroke={p.borderStrong}
                        strokeWidth={1}
                      />
                      {series.map((s) => (
                        <Circle
                          key={s.key}
                          cx={s.pts[shownActive][0]}
                          cy={s.pts[shownActive][1]}
                          r={4.5}
                          fill={s.color}
                          stroke={p.surface}
                          strokeWidth={2}
                        />
                      ))}
                    </>
                  )}
                </Svg>
                <YLabels niceMax={niceMax} height={H} ins={I} />
                {xLabelIndices(n).map((i) => (
                  <XLabel key={i} x={xAt(i, n, w, I)} height={H} text={formatDay(days[i], lang)} />
                ))}
                {empty ? (
                  <EmptyPlot text={t('flow_empty')} ins={I} testID="flow-empty" />
                ) : (
                  <View style={StyleSheet.absoluteFill} {...hit} testID="flow-hit" />
                )}
                {shownActive !== null && (
                  <Tooltip
                    testID="flow-tooltip"
                    x={xAt(shownActive, n, w, I)}
                    width={w}
                    top={I.top}
                    title={formatDay(days[shownActive], lang)}
                    rows={series.map((s) => ({ color: s.color, label: s.label, value: s.values[shownActive] }))}
                  />
                )}
              </>
            )}
          </View>
        </Ltr>
      </View>
    </ChartCard>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 14, paddingHorizontal: 18, paddingBottom: 18 },
  plot: { height: H },
});

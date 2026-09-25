import { useState } from 'react';
import { Platform, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { useAdminPalette, useAdminT } from '../i18n';
import { MOTION, RADIUS, TYPE } from '../theme';
import {
  MARKET_H as H,
  MARKET_INSETS as I,
  barLayout,
  gridValues,
  marketNiceMax,
  showsValueLabel,
  yAt,
} from '../chartGeometry';
import { stepAt, useTimeline } from '../motion';
import { AdminText } from './primitives';
import { ChartCard, EmptyPlot, Ltr, Tooltip, XLabel, YLabels } from './ChartParts';

const LABEL_FADE_DELAY = 500;
const LABEL_FADE = 400;

/**
 * Shared listings per week, oldest bar on the left. W1 is the current week,
 * counting back (as in the mockup). Bars grow from the baseline with a 55ms
 * stagger; the value labels (every other bar, and always the last) fade in
 * once their bar lands. The whole band is the hover/tap target.
 */
export function MarketChart({ weeks, range, style }: { weeks: number[]; range: number; style?: object }) {
  const p = useAdminPalette();
  const { t } = useAdminT();
  const [w, setW] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const n = weeks.length;
  const total = weeks.reduce((a, b) => a + b, 0);
  const empty = total === 0;
  const niceMax = marketNiceMax(weeks);
  const base = H - I.bottom;
  const { band, barW, centerX } = barLayout(n, w, I);
  const timelineMs = Math.max(MOTION.barGrow, LABEL_FADE_DELAY + LABEL_FADE) + MOTION.barStagger * Math.max(0, n - 1);
  const elapsed = useTimeline(timelineMs, range);
  const weekNo = (i: number) => n - i;
  const shownActive = active !== null && active < n && !empty ? active : null;

  const pick = (px: number) => {
    const i = Math.floor((px - I.left) / (band || 1));
    setActive(i >= 0 && i < n ? i : null);
  };
  const hit = {
    onStartShouldSetResponder: () => true,
    onResponderGrant: (e: GestureResponderEvent) => pick(e.nativeEvent.locationX),
    onResponderMove: (e: GestureResponderEvent) => pick(e.nativeEvent.locationX),
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
    <ChartCard title={t('market_title')} sub={t('market_sub')} style={style} testID="market-chart">
      <View style={styles.body}>
        <Ltr>
          <View
            style={styles.plot}
            onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('market_a11y', { weeks: n, total })}
            testID="market-plot"
          >
            {w > 0 && (
              <>
                <Svg width={w} height={H}>
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
                    weeks.map((v, i) => {
                      const full = base - yAt(v, niceMax, H, I);
                      const h = full * stepAt(elapsed, i * MOTION.barStagger, MOTION.barGrow);
                      return (
                        <Rect
                          key={i}
                          testID={`market-bar-${i}`}
                          x={centerX(i) - barW / 2}
                          y={base - h}
                          width={barW}
                          height={h}
                          rx={RADIUS.bar}
                          fill={p.series3}
                          opacity={shownActive === i ? 1 : 0.92}
                        />
                      );
                    })}
                </Svg>
                <YLabels niceMax={niceMax} height={H} ins={I} gap={7} />
                {!empty &&
                  weeks.map((v, i) =>
                    showsValueLabel(i, n) ? (
                      <AdminText
                        key={`v${i}`}
                        weight="semiBold"
                        tabular
                        testID="market-value"
                        style={[
                          styles.value,
                          {
                            left: centerX(i) - 24,
                            top: yAt(v, niceMax, H, I) - 7 - 14,
                            color: p.text2,
                            opacity: stepAt(elapsed, LABEL_FADE_DELAY + i * MOTION.barStagger, LABEL_FADE),
                          },
                        ]}
                      >
                        {v}
                      </AdminText>
                    ) : null,
                  )}
                {weeks.map((_, i) => (
                  <XLabel key={`x${i}`} x={centerX(i)} height={H} text={t('week_short', { n: weekNo(i) })} />
                ))}
                {empty ? (
                  <EmptyPlot text={t('market_empty')} ins={I} testID="market-empty" />
                ) : (
                  <View style={StyleSheet.absoluteFill} {...hit} testID="market-hit" />
                )}
                {shownActive !== null && (
                  <Tooltip
                    testID="market-tooltip"
                    x={centerX(shownActive)}
                    width={w}
                    top={I.top}
                    title={t('week_tip', { n: weekNo(shownActive) })}
                    rows={[{ color: p.series3, label: t('notices'), value: weeks[shownActive] }]}
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
  value: { position: 'absolute', width: 48, textAlign: 'center', ...TYPE.chip, fontSize: 11 },
});

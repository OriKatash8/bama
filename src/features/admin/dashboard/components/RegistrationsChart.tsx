import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { useAdminPalette, useScopedT } from '@features/communityAdmin/i18n';
import { MOTION, RADIUS, TYPE } from '@features/communityAdmin/theme';
import { MARKET_H as H, MARKET_INSETS as I, barLayout, gridValues, showsValueLabel, yAt } from '@features/communityAdmin/chartGeometry';
import { stepAt, useTimeline } from '@features/communityAdmin/motion';
import { AdminText } from '@features/communityAdmin/components/primitives';
import { Segment } from '@features/communityAdmin/components/AdminHeader';
import { ChartCard, EmptyPlot, Legend, Ltr, Tooltip, XLabel, YLabels } from '@features/communityAdmin/components/ChartParts';
import { groupedBars, regNiceMax } from '../geometry';

export type RegView = 'total' | 'by_mode';
export type RegPeriod = 'daily' | 'weekly';

const LABEL_FADE_DELAY = 500;
const LABEL_FADE = 400;

/**
 * New registrations per day or week, oldest on the left, in the community
 * dashboard's bar style: bars grow from the baseline with a stagger and
 * replay when the period or view changes; the whole band is the hover/tap
 * target. "By mode" puts a client bar and a pro bar side by side.
 */
export function RegistrationsChart({
  labels,
  total,
  client,
  pro,
  view,
  onView,
  period,
  loading,
  style,
}: {
  labels: string[];
  total: number[];
  client: number[];
  pro: number[];
  view: RegView;
  onView: (v: RegView) => void;
  period: RegPeriod;
  loading: boolean;
  style?: object;
}) {
  const p = useAdminPalette();
  const { t: at } = useScopedT('admin_dashboard');
  const { t: mt } = useScopedT('mode_picker');
  const [w, setW] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const n = labels.length;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const byMode = view === 'by_mode';
  const empty = !loading && sum(total) === 0 && sum(client) === 0 && sum(pro) === 0;
  const niceMax = byMode ? regNiceMax(client, pro) : regNiceMax(total);
  const base = H - I.bottom;
  const single = barLayout(n, w, I);
  const pair = groupedBars(n, w, I);
  const timelineMs = Math.max(MOTION.barGrow, LABEL_FADE_DELAY + LABEL_FADE) + MOTION.barStagger * Math.max(0, n - 1);
  const elapsed = useTimeline(timelineMs, `${period}:${view}`);
  const shownActive = active !== null && active < n && !empty && !loading ? active : null;

  const grow = (v: number, i: number) => (base - yAt(v, niceMax, H, I)) * stepAt(elapsed, i * MOTION.barStagger, MOTION.barGrow);

  const pick = (px: number) => {
    const i = Math.floor((px - I.left) / (single.band || 1));
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

  const segment = (
    <Segment<RegView>
      options={[
        { value: 'total', label: at('reg_total') },
        { value: 'by_mode', label: at('reg_by_mode') },
      ]}
      value={view}
      onChange={onView}
      label={at('view_a11y')}
      testIDPrefix="reg-view"
    />
  );

  return (
    <ChartCard title={at('registrations')} sub={at(`sub_${period}`)} side={segment} style={style} testID="reg-chart">
      {byMode && (
        <Legend
          items={[
            { color: p.series1, label: `${mt('client')} · ${sum(client)}` },
            { color: p.series3, label: `${mt('professional')} · ${sum(pro)}` },
          ]}
        />
      )}
      <View style={styles.body}>
        <Ltr>
          <View
            style={styles.plot}
            onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
            accessible
            accessibilityRole="image"
            accessibilityLabel={at('chart_a11y', { total: sum(total), n })}
            testID="reg-plot"
          >
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator size="small" color={p.text3} testID="reg-loading" />
              </View>
            ) : (
              w > 0 && (
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
                      !byMode &&
                      total.map((v, i) => {
                        const h = grow(v, i);
                        return (
                          <Rect
                            key={`t${i}`}
                            testID={`reg-bar-total-${i}`}
                            x={single.centerX(i) - single.barW / 2}
                            y={base - h}
                            width={single.barW}
                            height={h}
                            rx={RADIUS.bar}
                            fill={p.series1}
                            opacity={shownActive === i ? 1 : 0.92}
                          />
                        );
                      })}
                    {!empty &&
                      byMode &&
                      labels.map((_, i) => {
                        const hc = grow(client[i] ?? 0, i);
                        const hp = grow(pro[i] ?? 0, i);
                        const op = shownActive === i ? 1 : 0.92;
                        return [
                          <Rect
                            key={`c${i}`}
                            testID={`reg-bar-client-${i}`}
                            x={pair.firstX(i)}
                            y={base - hc}
                            width={pair.barW}
                            height={hc}
                            rx={RADIUS.bar}
                            fill={p.series1}
                            opacity={op}
                          />,
                          <Rect
                            key={`p${i}`}
                            testID={`reg-bar-pro-${i}`}
                            x={pair.secondX(i)}
                            y={base - hp}
                            width={pair.barW}
                            height={hp}
                            rx={RADIUS.bar}
                            fill={p.series3}
                            opacity={op}
                          />,
                        ];
                      })}
                  </Svg>
                  <YLabels niceMax={niceMax} height={H} ins={I} gap={7} />
                  {!empty &&
                    !byMode &&
                    total.map((v, i) =>
                      showsValueLabel(i, n) ? (
                        <AdminText
                          key={`v${i}`}
                          weight="semiBold"
                          tabular
                          style={[
                            styles.value,
                            {
                              left: single.centerX(i) - 24,
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
                  {labels.map((l, i) => (
                    <XLabel key={`x${i}`} x={single.centerX(i)} height={H} text={l} />
                  ))}
                  {empty ? (
                    <EmptyPlot text={at('no_data')} ins={I} testID="reg-empty" />
                  ) : (
                    <View style={StyleSheet.absoluteFill} {...hit} testID="reg-hit" />
                  )}
                  {shownActive !== null && (
                    <Tooltip
                      testID="reg-tooltip"
                      x={single.centerX(shownActive)}
                      width={w}
                      top={I.top}
                      title={labels[shownActive]}
                      rows={
                        byMode
                          ? [
                              { color: p.series1, label: mt('client'), value: client[shownActive] ?? 0 },
                              { color: p.series3, label: mt('professional'), value: pro[shownActive] ?? 0 },
                            ]
                          : [{ color: p.series1, label: at('reg_total'), value: total[shownActive] ?? 0 }]
                      }
                    />
                  )}
                </>
              )
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  value: { position: 'absolute', width: 48, textAlign: 'center', ...TYPE.chip, fontSize: 11 },
});

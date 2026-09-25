import { useId, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useAdminPalette, useAdminT, ago } from '../i18n';
import { MOTION, RADIUS, TYPE } from '../theme';
import { SPARK_H, areaPath, linePath, pathLength, sparkPoints } from '../chartGeometry';
import { stepAt, useTimeline } from '../motion';
import { formatDelta, signed, type TileStats } from '../stats';
import type { Delta } from '../aggregate';
import { AdminText, Card } from './primitives';

/**
 * A number that counts to its value over ~900ms: from 0 on first paint, then
 * from whatever it shows to each new value. Reduced motion shows the value.
 * Screen readers get the final value, never an in-between one.
 */
export function CountUp({
  value,
  format = (n) => n.toLocaleString('en-US'),
  style,
  testID,
}: {
  value: number;
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const [run, setRun] = useState({ from: 0, to: value, key: 0 });
  const elapsed = useTimeline(MOTION.countUp, run.key);
  const shown = Math.round(run.from + (run.to - run.from) * stepAt(elapsed, 0, MOTION.countUp));
  // A new value restarts the count from what is on screen right now.
  if (value !== run.to) setRun({ from: shown, to: value, key: run.key + 1 });
  return (
    <AdminText weight="bold" tabular style={style} accessibilityLabel={format(value)} testID={testID}>
      {format(shown)}
    </AdminText>
  );
}

/**
 * 34px trend line with a ringed endpoint, drawn in over 900ms. Renders
 * nothing until its width is known (a 0-width first paint would put NaN in
 * the path). `fill` adds the 26%→0 gradient under the line.
 */
export function Sparkline({
  values,
  color,
  fill,
  replayKey,
  testID,
}: {
  values: number[];
  color: string;
  fill?: boolean;
  replayKey: unknown;
  testID?: string;
}) {
  const p = useAdminPalette();
  const [w, setW] = useState(0);
  const gradId = `spark${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const elapsed = useTimeline(MOTION.countUp, replayKey);
  const pts = sparkPoints(values, w);
  const len = pathLength(pts);
  const drawn = stepAt(elapsed, 0, MOTION.countUp);
  const last = pts[pts.length - 1];

  return (
    <View
      style={styles.spark}
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {w > 0 && last && (
        <Svg width={w} height={SPARK_H}>
          {fill && (
            <>
              <Defs>
                <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color} stopOpacity={0.26} />
                  <Stop offset="1" stopColor={color} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Path d={areaPath(pts, SPARK_H)} fill={`url(#${gradId})`} opacity={0.9 * drawn} />
            </>
          )}
          <Path
            d={linePath(pts)}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...(len > 0 ? { strokeDasharray: `${len} ${len}`, strokeDashoffset: len * (1 - drawn) } : null)}
          />
          <Circle cx={last[0]} cy={last[1]} r={3.4} fill={color} stroke={p.surface} strokeWidth={2} />
        </Svg>
      )}
    </View>
  );
}

function DeltaChip({ text, kind }: { text: string; kind: Delta['kind'] }) {
  const p = useAdminPalette();
  const [bg, fg] = kind === 'good' ? [p.goodBg, p.good] : kind === 'bad' ? [p.badBg, p.bad] : [p.surface3, p.text2];
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <AdminText weight="semiBold" tabular numberOfLines={1} style={[TYPE.chip, { color: fg }]}>
        {text}
      </AdminText>
    </View>
  );
}

function StatTile({
  label,
  value,
  format,
  chip,
  caption,
  spark,
  ring,
  testID,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  chip: { text: string; kind: Delta['kind'] };
  caption?: string;
  spark: { values: number[]; color: string; fill?: boolean; replayKey: unknown };
  ring?: boolean;
  testID: string;
}) {
  const p = useAdminPalette();
  const { rowDir, textAlign } = useAdminT();
  return (
    <Card ring={ring} style={styles.tile} testID={testID}>
      <View style={styles.tileBody}>
        <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.statLabel, { color: p.text3, textAlign }]}>
          {label}
        </AdminText>
        <CountUp value={value} format={format} style={[TYPE.statValue, styles.value, { textAlign }]} testID={`${testID}-value`} />
        <View style={[styles.foot, { flexDirection: rowDir }]}>
          <DeltaChip {...chip} />
          {caption ? (
            <AdminText numberOfLines={1} style={[styles.caption, { color: p.text2 }]}>
              {caption}
            </AdminText>
          ) : null}
        </View>
        <Sparkline {...spark} testID={`${testID}-spark`} />
      </View>
    </Card>
  );
}

/** Four tiles: one row from 900px, 2×2 below, one column below 420px. Rows mirror in Hebrew. */
export function StatTiles({ stats, width, range, now }: { stats: TileStats; width: number; range: number; now: Date }) {
  const p = useAdminPalette();
  const { t, rowDir } = useAdminT();
  const cols = width >= 900 ? 4 : width >= 420 ? 2 : 1;
  const { members, requests, net, market } = stats;

  const tiles = [
    <StatTile
      key="members"
      testID="tile-members"
      label={t('tile_members')}
      value={members.value}
      chip={{ text: formatDelta(members.delta), kind: members.delta.kind }}
      caption={t('vs_prev')}
      spark={{ values: members.spark, color: p.series1, fill: true, replayKey: range }}
    />,
    <StatTile
      key="requests"
      testID="tile-requests"
      label={t('tile_requests')}
      value={requests.value}
      ring={requests.value > 0}
      chip={{
        text: requests.oldest ? t('oldest', { ago: ago(t, requests.oldest, now) }) : t('all_clear'),
        kind: 'neutral',
      }}
      spark={{ values: requests.spark, color: p.warn, replayKey: range }}
    />,
    <StatTile
      key="net"
      testID="tile-net"
      label={t('tile_net')}
      value={net.value}
      format={signed}
      chip={{
        text: `${signed(net.joins)} / ${net.exits > 0 ? '−' : ''}${net.exits}`,
        kind: net.value > 0 ? 'good' : net.value < 0 ? 'bad' : 'neutral',
      }}
      caption={t('joins_minus_exits')}
      spark={{ values: net.spark, color: p.series3, fill: true, replayKey: range }}
    />,
    <StatTile
      key="market"
      testID="tile-market"
      label={t('tile_market')}
      value={market.value}
      chip={{ text: formatDelta(market.delta), kind: market.delta.kind }}
      caption={t('in_range')}
      spark={{ values: market.spark, color: p.series3, replayKey: range }}
    />,
  ];

  const rows: ReactNode[][] = [];
  for (let i = 0; i < tiles.length; i += cols) rows.push(tiles.slice(i, i + cols));
  return (
    <View style={styles.grid} testID="stat-tiles">
      {rows.map((row, i) => (
        <View key={i} style={[styles.row, { flexDirection: rowDir }]}>
          {row}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 14 },
  row: { gap: 14 },
  tile: { flex: 1, minWidth: 0 },
  tileBody: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 12 },
  value: { marginTop: 6, lineHeight: 36 },
  foot: { alignItems: 'center', gap: 8, marginTop: 8 },
  chip: { borderRadius: RADIUS.pill, paddingVertical: 2, paddingHorizontal: 7, flexShrink: 0 },
  caption: { fontSize: 12, flexShrink: 1 },
  spark: { height: SPARK_H, marginTop: 10 },
});

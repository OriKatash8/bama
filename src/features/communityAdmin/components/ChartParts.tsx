import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { useAdminPalette, useAdminT } from '../i18n';
import { RADIUS, SPACE, TYPE, liftShadow } from '../theme';
import { gridValues, tickLabel, yAt, type Insets } from '../chartGeometry';
import { AdminText, Card } from './primitives';

/** A chart card: title + muted sub in the head (these mirror), then the body. */
export function ChartCard({
  title,
  sub,
  children,
  style,
  testID,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  style?: object;
  testID?: string;
}) {
  const p = useAdminPalette();
  const { rowDir } = useAdminT();
  return (
    <Card style={style} testID={testID}>
      <View style={[styles.head, { flexDirection: rowDir }]}>
        <AdminText weight="semiBold" accessibilityRole="header" numberOfLines={1} style={[TYPE.cardTitle, styles.title]}>
          {title}
        </AdminText>
        {sub ? (
          <AdminText numberOfLines={1} style={[TYPE.rowMeta, styles.sub, { color: p.text3 }]}>
            {sub}
          </AdminText>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

export function Swatch({ color }: { color: string }) {
  return <View style={[styles.swatch, { backgroundColor: color }]} />;
}

/** Legend above the plot: 10px rounded swatch + 12.5 label. Text UI, so it mirrors. */
export function Legend({ items }: { items: { color: string; label: string }[] }) {
  const p = useAdminPalette();
  const { rowDir } = useAdminT();
  return (
    <View style={[styles.legend, { flexDirection: rowDir }]} testID="chart-legend">
      {items.map((it) => (
        <View key={it.label} style={[styles.legendItem, { flexDirection: rowDir }]}>
          <Swatch color={it.color} />
          <AdminText style={[styles.legendText, { color: p.text2 }]}>{it.label}</AdminText>
        </View>
      ))}
    </View>
  );
}

/**
 * Keeps a chart left-to-right in both languages: time runs left to right and
 * the y axis stays on the left. Only the text around the chart mirrors.
 *
 * Today nothing would mirror it anyway (the app never enables RTL layout, the
 * SVG uses absolute x and the labels absolute `left`), so this is a guard for
 * the day RTL layout is switched on:
 * - web: the `dir` attribute. react-native-web's View forwards it and scopes
 *   direction for everything inside. A `direction` STYLE is not an option
 *   there: RNW's StyleSheet rejects it ("Did you mean writingDirection?") and
 *   deletes it.
 * - native: Yoga's `direction` layout style, which is valid there.
 */
export function Ltr({ children }: { children: ReactNode }) {
  const ltr: ViewProps = Platform.OS === 'web' ? ({ dir: 'ltr' } as ViewProps) : { style: { direction: 'ltr' } };
  return (
    <View {...ltr} testID="chart-ltr">
      {children}
    </View>
  );
}

/** Y labels right-aligned 8px (7 for the market chart) outside the plot's left edge. */
export function YLabels({
  niceMax,
  height,
  ins,
  gap = 8,
}: {
  niceMax: number;
  height: number;
  ins: Insets;
  gap?: number;
}) {
  const p = useAdminPalette();
  return (
    <>
      {gridValues(niceMax).map((v) => (
        <AdminText
          key={v}
          tabular
          testID="y-label"
          style={[TYPE.axis, styles.yLabel, { width: ins.left - gap, top: yAt(v, niceMax, height, ins) - 7, color: p.text3 }]}
        >
          {tickLabel(v)}
        </AdminText>
      ))}
    </>
  );
}

/** A label centred on x, its baseline ~8px above the chart's bottom edge. */
export function XLabel({ x, height, text }: { x: number; height: number; text: string }) {
  const p = useAdminPalette();
  return (
    <AdminText
      tabular
      numberOfLines={1}
      testID="x-label"
      style={[TYPE.axis, styles.xLabel, { left: x - 32, top: height - 21, color: p.text3 }]}
    >
      {text}
    </AdminText>
  );
}

/** Written empty state laid over an empty plot (axes still drawn under it). */
export function EmptyPlot({ text, ins, testID }: { text: string; ins: Insets; testID?: string }) {
  const p = useAdminPalette();
  return (
    <View
      pointerEvents="none"
      testID={testID}
      style={[styles.emptyPlot, { left: ins.left, right: ins.right, top: ins.top, bottom: ins.bottom }]}
    >
      <AdminText style={[styles.emptyText, { color: p.text3, backgroundColor: p.surface }]}>{text}</AdminText>
    </View>
  );
}

/**
 * Hover/tap card beside the crosshair — to its right, or to its left when
 * the point is in the right part of the plot — never under the finger.
 */
export function Tooltip({
  x,
  width,
  top,
  title,
  rows,
  testID,
}: {
  x: number;
  width: number;
  top: number;
  title: string;
  rows: { color: string; label: string; value: number }[];
  testID?: string;
}) {
  const p = useAdminPalette();
  const { rowDir } = useAdminT();
  const side = x > width * 0.6 ? { right: width - x + 12 } : { left: x + 12 };
  return (
    <View
      pointerEvents="none"
      testID={testID}
      style={[styles.tip, side, { top, backgroundColor: p.surface, borderColor: p.borderStrong }, liftShadow(p)]}
    >
      <AdminText tabular style={[styles.tipDate, { color: p.text3 }]}>
        {title}
      </AdminText>
      {rows.map((r) => (
        <View key={r.label} style={[styles.tipRow, { flexDirection: rowDir }]}>
          <Swatch color={r.color} />
          <AdminText style={[styles.tipText, { color: p.text }]}>{r.label}</AdminText>
          <AdminText weight="bold" tabular style={[styles.tipText, { color: p.text }]}>
            {r.value}
          </AdminText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'baseline', gap: 10, paddingTop: 16, paddingHorizontal: SPACE.rowPadH },
  title: { flexShrink: 0 },
  sub: { flexShrink: 1 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legend: { gap: 14, flexWrap: 'wrap', alignItems: 'center', paddingTop: 10, paddingHorizontal: SPACE.rowPadH },
  legendItem: { alignItems: 'center', gap: 6 },
  legendText: { fontSize: 12.5 },
  yLabel: { position: 'absolute', left: 0, textAlign: 'right' },
  xLabel: { position: 'absolute', width: 64, textAlign: 'center' },
  emptyPlot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  tip: { position: 'absolute', borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, zIndex: 5 },
  tipDate: { fontSize: 11, marginBottom: 4 },
  tipRow: { alignItems: 'center', gap: 6 },
  tipText: { fontSize: 12 },
});

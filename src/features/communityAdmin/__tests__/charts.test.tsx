import React from 'react';
import { StyleSheet, View } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import { MemberFlowChart } from '../components/MemberFlowChart';
import { MarketChart } from '../components/MarketChart';
import { StatTiles } from '../components/StatTiles';
import { tileStats } from '../stats';
import { dayStarts } from '../aggregate';
import { FLOW_INSETS } from '../chartGeometry';
import { Ltr } from '../components/ChartParts';

/**
 * Tiles and charts: nothing drawn before a width, empty data drawn as empty
 * axes with a written note, a single point without NaN, the end state under
 * reduced motion, the draw-in without it, and charts that never mirror.
 */

let mockLang = 'en';
let mockReduce = false;

jest.mock('react-native-reanimated', () => ({
  ...require('../../../testing/reanimatedMock').reanimatedMock(),
  useReducedMotion: () => mockReduce,
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));

const E = en.community_admin;
const NOW = new Date(2026, 8, 25, 15);
const DAYS7 = dayStarts(7, NOW);

beforeEach(() => {
  mockLang = 'en';
  mockReduce = false;
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

const layout = (r: ReturnType<typeof render>, testID: string, width = 400) =>
  act(() => {
    fireEvent(r.getByTestId(testID), 'layout', { nativeEvent: { layout: { width, height: 236, x: 0, y: 0 } } });
  });

/** The svg Path element itself (react-native-svg's host node holds processed props). */
const svgPath = (r: ReturnType<typeof render>, testID: string) =>
  r.UNSAFE_root.findAll((n) => n.props.testID === testID && typeof n.props.d === 'string')[0];

/** Every `d` on every svg Path, for the NaN checks. */
const pathData = (r: ReturnType<typeof render>) =>
  r.UNSAFE_root.findAll((n) => typeof n.props.d === 'string').map((n) => n.props.d as string);

describe('MemberFlowChart', () => {
  const flow = (joins: number[], exits: number[], days = DAYS7) => (
    <MemberFlowChart days={days} joins={joins} exits={exits} range={days.length} />
  );

  it('draws nothing until it knows its width', () => {
    const r = render(flow([1, 0, 2, 0, 0, 1, 3], [0, 1, 0, 0, 0, 0, 1]));
    expect(r.queryAllByTestId('y-label')).toHaveLength(0);
    expect(pathData(r)).toHaveLength(0);
    layout(r, 'flow-plot');
    expect(r.queryAllByTestId('y-label')).toHaveLength(5);
    pathData(r).forEach((d) => expect(d).not.toMatch(/NaN|Infinity/));
  });

  it('shows empty axes and says so for a community with no events — no line claiming zero', () => {
    const r = render(flow([0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]));
    layout(r, 'flow-plot');
    expect(within(r.getByTestId('flow-empty')).getByText(E.flow_empty)).toBeTruthy();
    expect(r.queryByTestId('flow-line-j')).toBeNull();
    expect(r.queryByTestId('flow-line-e')).toBeNull();
    expect(r.getAllByTestId('y-label').map((n) => n.props.children)).toEqual(['0', '1.5', '3', '4.5', '6']);
    expect(r.getAllByTestId('x-label').length).toBeGreaterThan(0);
  });

  it('spaces a single data point without dividing by zero', () => {
    const r = render(flow([2], [1], [DAYS7[6]]));
    layout(r, 'flow-plot');
    const ds = pathData(r);
    expect(ds.length).toBeGreaterThan(0);
    ds.forEach((d) => expect(d).not.toMatch(/NaN|Infinity/));
  });

  it('draws the lines in from their full length to 0 over 1100ms', () => {
    const r = render(flow([1, 0, 2, 0, 0, 1, 3], [0, 1, 0, 0, 0, 0, 1]));
    layout(r, 'flow-plot');
    const offset = () => svgPath(r, 'flow-line-j').props.strokeDashoffset as number;
    expect(offset()).toBeGreaterThan(0);
    act(() => { jest.advanceTimersByTime(1200); });
    expect(offset()).toBeCloseTo(0);
  });

  it('renders the end state straight away under reduced motion', () => {
    mockReduce = true;
    const r = render(flow([1, 0, 2, 0, 0, 1, 3], [0, 1, 0, 0, 0, 0, 1]));
    layout(r, 'flow-plot');
    expect(svgPath(r, 'flow-line-j').props.strokeDashoffset).toBe(0);
  });

  it('touching the plot shows a crosshair and the day with both values', () => {
    const r = render(flow([1, 0, 2, 0, 0, 1, 3], [0, 1, 0, 0, 0, 0, 1]));
    layout(r, 'flow-plot');
    act(() => {
      fireEvent(r.getByTestId('flow-hit'), 'responderGrant', { nativeEvent: { locationX: 9999 } });
    });
    expect(r.getByTestId('flow-crosshair')).toBeTruthy();
    const tip = within(r.getByTestId('flow-tooltip'));
    expect(tip.getByText('25 Sept')).toBeTruthy();
    expect(tip.getByText('3')).toBeTruthy();
    expect(tip.getByText('1')).toBeTruthy();
  });

  it('stays left-to-right in Hebrew: y labels on the left, legend mirrored', () => {
    mockLang = 'he';
    const r = render(flow([1, 0, 2, 0, 0, 1, 3], [0, 1, 0, 0, 0, 0, 1]));
    layout(r, 'flow-plot');
    expect(StyleSheet.flatten(r.getByTestId('chart-ltr').props.style)?.direction).toBe('ltr');
    expect(within(r.getByTestId('chart-ltr')).getByTestId('flow-plot')).toBeTruthy();
    for (const label of r.getAllByTestId('y-label')) {
      const s = StyleSheet.flatten(label.props.style);
      expect(s.left).toBe(0);
      expect(s.width).toBe(FLOW_INSETS.left - 8);
      expect(s.textAlign).toBe('right');
    }
    // The legend is text around the chart, so it does mirror; it sits outside the ltr wrapper.
    expect(StyleSheet.flatten(r.getByTestId('chart-legend').props.style).flexDirection).toBe('row-reverse');
    expect(within(r.getByTestId('chart-ltr')).queryByTestId('chart-legend')).toBeNull();
    // Hebrew dates read d.m
    expect(r.getAllByTestId('x-label').map((n) => n.props.children)).toContain('25.9');
  });
});

describe('Ltr on web', () => {
  // The native Yoga style would be rejected (and deleted) by react-native-web's
  // StyleSheet; on web the wrapper must use the dir attribute instead.
  it('uses dir="ltr" and no direction style', () => {
    const { Platform } = jest.requireActual('react-native');
    const original = Platform.OS;
    Platform.OS = 'web';
    try {
      const r = render(<Ltr><View /></Ltr>);
      const node = r.getByTestId('chart-ltr');
      expect(node.props.dir).toBe('ltr');
      expect(StyleSheet.flatten(node.props.style)?.direction).toBeUndefined();
    } finally {
      Platform.OS = original;
    }
  });
});

describe('MarketChart', () => {
  it('labels every other bar and the last, W-numbers counting back from this week', () => {
    mockReduce = true;
    const r = render(<MarketChart weeks={[3, 5, 0, 8]} range={30} />);
    layout(r, 'market-plot');
    expect(r.getAllByTestId('market-value').map((n) => n.props.children)).toEqual([3, 0, 8]);
    expect(r.getAllByTestId('x-label').map((n) => n.props.children)).toEqual(['W4', 'W3', 'W2', 'W1']);
  });

  it('grows the bars from the baseline, staggered, and lands them', () => {
    const r = render(<MarketChart weeks={[4, 4, 4, 4]} range={30} />);
    layout(r, 'market-plot');
    const h = (i: number) => r.getByTestId(`market-bar-${i}`).props.height as number;
    expect(h(0)).toBe(0);
    act(() => { jest.advanceTimersByTime(400); });
    expect(h(0)).toBeGreaterThan(h(3));
    act(() => { jest.advanceTimersByTime(1000); });
    expect(h(3)).toBeCloseTo(h(0));
    expect(h(0)).toBeGreaterThan(0);
  });

  it('hovering anywhere in a band shows that week', () => {
    mockReduce = true;
    const r = render(<MarketChart weeks={[3, 5, 0, 8]} range={30} />);
    layout(r, 'market-plot');
    act(() => {
      // 400 wide, insets 28/10 → bands of 90.5px; x=120 is inside band 1, clear of its bar.
      fireEvent(r.getByTestId('market-hit'), 'responderGrant', { nativeEvent: { locationX: 120 } });
    });
    const tip = within(r.getByTestId('market-tooltip'));
    expect(tip.getByText(E.week_tip.replace('{{n}}', '3'))).toBeTruthy();
    expect(tip.getByText('5')).toBeTruthy();
    expect(r.getByTestId('market-bar-1').props.opacity).toBe(1);
    expect(r.getByTestId('market-bar-0').props.opacity).toBe(0.92);
  });

  it('shows empty axes and a note when nothing was shared', () => {
    const r = render(<MarketChart weeks={[0, 0, 0, 0]} range={7} />);
    layout(r, 'market-plot');
    expect(within(r.getByTestId('market-empty')).getByText(E.market_empty)).toBeTruthy();
    expect(r.queryByTestId('market-bar-0')).toBeNull();
    expect(r.getAllByTestId('y-label')).toHaveLength(5);
  });
});

describe('StatTiles', () => {
  const stats = (pending: number) =>
    tileStats({
      memberCount: 12,
      events: [],
      pendingSince: Array.from({ length: pending }, () => new Date(2026, 8, 23)),
      listingDates: [],
      range: 7,
      now: NOW,
    });

  it('shows the values at once under reduced motion, as tabular numbers', () => {
    mockReduce = true;
    const r = render(<StatTiles stats={stats(2)} width={1000} range={7} now={NOW} />);
    const value = r.getByTestId('tile-members-value');
    expect(value.props.children).toBe('12');
    expect(StyleSheet.flatten(value.props.style).fontVariant).toEqual(['tabular-nums']);
    expect(r.getByTestId('tile-requests-value').props.children).toBe('2');
  });

  it('counts up from 0 without reduced motion, and tells screen readers the final value', () => {
    const r = render(<StatTiles stats={stats(0)} width={1000} range={7} now={NOW} />);
    const value = () => r.getByTestId('tile-members-value');
    expect(value().props.children).toBe('0');
    expect(value().props.accessibilityLabel).toBe('12');
    act(() => { jest.advanceTimersByTime(1000); });
    expect(value().props.children).toBe('12');
  });

  it('rings the requests tile only while something is pending', () => {
    mockReduce = true;
    // On native the ring is the card's inner 1px border in the amber ring colour.
    const ringed = (pending: number) => {
      const r = render(<StatTiles stats={stats(pending)} width={1000} range={7} now={NOW} />);
      return JSON.stringify(r.toJSON()).includes('rgba(237,161,0,.34)');
    };
    expect(ringed(1)).toBe(true);
    expect(ringed(0)).toBe(false);
  });

  it('lays out 4 across from 900px, 2×2 below, 1 column below 420px', () => {
    mockReduce = true;
    const rowsOf = (width: number) =>
      render(<StatTiles stats={stats(0)} width={width} range={7} now={NOW} />).getByTestId('stat-tiles').props.children
        .length;
    expect(rowsOf(1000)).toBe(1);
    expect(rowsOf(600)).toBe(2);
    expect(rowsOf(380)).toBe(4);
  });
});

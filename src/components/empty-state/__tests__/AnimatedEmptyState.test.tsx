import React from 'react';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { AnimatedEmptyState } from '../AnimatedEmptyState';
import { ROLES, labelOf } from '@features/crew/data/categories';
import { ROLE_GLYPHS } from '@features/crew/data/roleTiles';
import { scaleLeft } from '../emptyStateLayout';

/**
 * The shared animated empty state: floating glass cards over soft glows, then
 * the screen's own title, subtitle, CTA and link. The cards are decoration —
 * hidden from touch and from screen readers. Role cards take their label and
 * glyph from the app's real role data. Loops run while the screen is focused,
 * stop when it is not, and never start under reduced motion.
 */

const mockWithRepeat = jest.fn((a: unknown) => a);
const mockCancel = jest.fn();
let mockReduced = false;
jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  const id = (x: unknown) => x;
  return {
    __esModule: true,
    default: { View: RN.View, createAnimatedComponent: (c: unknown) => c },
    useSharedValue: (v: unknown) => {
      const sv = { value: v, get: () => sv.value, set: (n: unknown) => { sv.value = n; } };
      return sv;
    },
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: id,
    withSpring: id,
    withDelay: (_d: number, a: unknown) => a,
    withSequence: (...a: unknown[]) => a[a.length - 1],
    withRepeat: (...a: unknown[]) => mockWithRepeat(...(a as [unknown])),
    cancelAnimation: (...a: unknown[]) => mockCancel(...a),
    Easing: { inOut: id, out: id, sin: id, cubic: id, quad: id },
    useReducedMotion: () => mockReduced,
  };
});
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));
jest.mock('expo-image', () => {
  const RN = jest.requireActual('react-native');
  return { Image: (p: Record<string, unknown>) => require('react').createElement(RN.View, { testID: 'glyph', ...p }) };
});
jest.mock('react-native-svg', () => {
  const RN = jest.requireActual('react-native');
  const P = ({ children }: { children?: React.ReactNode }) => require('react').createElement(RN.View, null, children);
  // Every svg element the glows draw and lucide icons draw with. Listed out:
  // Babel's import interop copies only real keys, so a Proxy would not survive.
  const names = ['Svg', 'Path', 'Circle', 'Rect', 'Line', 'Polyline', 'Polygon', 'Ellipse', 'G', 'Defs',
    'RadialGradient', 'LinearGradient', 'Stop', 'ClipPath', 'Mask', 'Use', 'Text', 'TSpan'];
  return { __esModule: true, default: P, ...Object.fromEntries(names.map((n) => [n, P])) };
});
let mockLang = 'he';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));

/** The illustration is hidden from screen readers, so its contents need this to be found. */
const H = { includeHiddenElements: true };
const base = { title: 'עוד אין לך פרויקטים', subtitle: 'פרסמו פרויקט' };

beforeEach(() => { jest.clearAllMocks(); mockReduced = false; mockLang = 'he'; });

describe('text and actions', () => {
  it('shows the title, subtitle, CTA and link, and each does its job', () => {
    const onCta = jest.fn();
    const onLink = jest.fn();
    const r = render(
      <AnimatedEmptyState variant="tiles" {...base}
        primaryCta={{ label: 'פרסמו פרויקט עכשיו', icon: <Text>+</Text>, onPress: onCta }}
        secondaryLink={{ label: 'או חפשו', onPress: onLink }} />,
    );
    expect(r.getByText(base.title)).toBeTruthy();
    expect(r.getByText(base.subtitle)).toBeTruthy();
    expect(r.getByText('+')).toBeTruthy();
    fireEvent.press(r.getByText('פרסמו פרויקט עכשיו'));
    fireEvent.press(r.getByText('או חפשו'));
    expect(onCta).toHaveBeenCalledTimes(1);
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it('invents nothing: no CTA or link unless given', () => {
    const r = render(<AnimatedEmptyState variant="bubbles" {...base} />);
    expect(r.queryByTestId('empty-cta')).toBeNull();
    expect(r.queryByTestId('empty-link')).toBeNull();
  });

  it('shows an optional note under the subtitle', () => {
    const r = render(<AnimatedEmptyState variant="board" {...base} note="שדרגו את הפרופיל" />);
    expect(r.getByText('שדרגו את הפרופיל')).toBeTruthy();
  });

  it('title is 26 / 800 in Heebo in Hebrew, Montserrat in English', () => {
    const he = StyleSheet.flatten(render(<AnimatedEmptyState variant="tiles" {...base} />).getByText(base.title).props.style);
    expect([he.fontSize, he.fontWeight, he.fontFamily, he.color]).toEqual([26, '800', 'Heebo-ExtraBold', '#1A1530']);
    mockLang = 'en';
    const en = StyleSheet.flatten(render(<AnimatedEmptyState variant="tiles" {...base} />).getByText(base.title).props.style);
    expect(en.fontFamily).toBe('Montserrat');
  });
});

describe('the illustration', () => {
  it('is decoration: no touches, hidden from screen readers', () => {
    const ill = render(<AnimatedEmptyState variant="tiles" {...base} />).getByTestId('empty-illustration', H);
    expect(ill.props.pointerEvents).toBe('none');
    expect(ill.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(ill.props.accessibilityElementsHidden).toBe(true);
  });

  it('tiles: the six default roles, each with its real label and glyph, tinted white', () => {
    const r = render(<AnimatedEmptyState variant="tiles" {...base} />);
    for (const id of ['videographer', 'photographer', 'editor', 'sound', 'lighting', 'graphic_designer']) {
      const role = ROLES.find((x) => x.id === id)!;
      expect(r.getByText(labelOf(role, 'he'), H)).toBeTruthy();
    }
    const glyphs = r.getAllByTestId('glyph', H);
    expect(glyphs).toHaveLength(6);
    expect(glyphs[0].props.source).toBe(ROLE_GLYPHS.videographer);
    expect(glyphs.every((g) => g.props.tintColor === '#FFFFFF')).toBe(true);
    expect(r.queryAllByText('₪', H)).toHaveLength(0);
  });

  it('board: the same role cards, each with a ₪ pill', () => {
    const r = render(<AnimatedEmptyState variant="board" {...base} />);
    expect(r.queryAllByText('₪', H)).toHaveLength(6);
  });

  it('bubbles: six chat bubbles, no role cards', () => {
    const r = render(<AnimatedEmptyState variant="bubbles" {...base} />);
    expect(r.getAllByTestId(/^empty-card-/, H)).toHaveLength(6);
    expect(r.queryAllByTestId('glyph', H)).toHaveLength(0);
    expect(r.queryByText(labelOf(ROLES[0], 'he'), H)).toBeNull();
  });

  it('honours a custom role list', () => {
    const r = render(<AnimatedEmptyState variant="tiles" {...base} roles={['lighting', 'sound']} />);
    expect(r.getAllByTestId(/^empty-card-/, H)).toHaveLength(2);
  });
});

describe('motion', () => {
  it('loops while focused (cards and glows)', () => {
    render(<AnimatedEmptyState variant="tiles" {...base} />);
    // 6 cards + 3 glows.
    expect(mockWithRepeat.mock.calls.length).toBeGreaterThanOrEqual(9);
  });

  it('stops every loop when the screen loses focus', () => {
    const { unmount } = render(<AnimatedEmptyState variant="tiles" {...base} />);
    mockCancel.mockClear();
    unmount();
    expect(mockCancel.mock.calls.length).toBeGreaterThanOrEqual(9);
  });

  it('reduced motion: the final static layout, no loops at all', () => {
    mockReduced = true;
    render(<AnimatedEmptyState variant="tiles" {...base} />);
    expect(mockWithRepeat).not.toHaveBeenCalled();
  });
});

describe('full width', () => {
  const windowWidth = () => {
    let w = 0;
    const Probe = () => { w = useWindowDimensions().width; return null; };
    render(<Probe />);
    return w;
  };

  it('cancels the parent\'s side padding, so the panel spans the screen', () => {
    const r = render(<AnimatedEmptyState variant="tiles" {...base} bleed={20} />);
    const panel = StyleSheet.flatten(r.getByTestId('empty-panel').props.style);
    expect(panel.marginHorizontal).toBe(-20);
    expect(panel.alignSelf).toBe('stretch');
    expect(panel.flexGrow).toBe(1);
    expect(panel.overflow).toBe('hidden');
    expect(panel.width).toBeUndefined();
  });

  it('can also cancel the parent\'s top padding, meeting the sheet at its top edge with the sheet\'s own corners', () => {
    const r = render(<AnimatedEmptyState variant="tiles" {...base} bleed={20} bleedTop={18} radius={26} />);
    const panel = StyleSheet.flatten(r.getByTestId('empty-panel').props.style);
    expect(panel.marginTop).toBe(-18);
    expect(panel.borderTopLeftRadius).toBe(26);
    expect(panel.borderTopRightRadius).toBe(26);
  });

  it('by default keeps its own 32pt corners and does not move up', () => {
    const panel = StyleSheet.flatten(render(<AnimatedEmptyState variant="tiles" {...base} />).getByTestId('empty-panel').props.style);
    expect(panel.marginTop).toBe(-0);
    expect(panel.borderTopLeftRadius).toBe(32);
  });

  it('lays the cards out on the WINDOW width (390 is only the scaling reference)', () => {
    const w = windowWidth();
    const r = render(<AnimatedEmptyState variant="tiles" {...base} bleed={20} />);
    const card = StyleSheet.flatten(r.getByTestId('empty-card-videographer', H).props.style);
    expect(card.left).toBeCloseTo(scaleLeft(226, w));
  });
});


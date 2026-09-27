import React from 'react';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { AnimatedEmptyState } from '../AnimatedEmptyState';
import { ROLES, labelOf } from '@features/crew/data/categories';
import { EMPTY_STATE_GLYPHS } from '@features/crew/data/roleTiles';
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
jest.mock('expo-linear-gradient', () => {
  const RN = jest.requireActual('react-native');
  // A View carrying the gradient's colours and testID, so a test can read them.
  return {
    LinearGradient: ({ children, colors, testID }: { children?: React.ReactNode; colors: string[]; testID?: string }) =>
      require('react').createElement(RN.View, { testID, colors }, children),
  };
});
let mockAccent = '#6D28D9';
jest.mock('@core/navigation/floatingTabBar', () => ({
  CLIENT_TAB_ACTIVE: '#6D28D9',
  PRO_TAB_ACTIVE: '#1D4ED8',
  useModeAccent: () => ({ accent: mockAccent, tint: '#fff' }),
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

beforeEach(() => { jest.clearAllMocks(); mockReduced = false; mockLang = 'he'; mockAccent = '#6D28D9'; });

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
    // The pre-sized set (28/56/84 px), not the 256px originals.
    expect(glyphs[0].props.source).toBe(EMPTY_STATE_GLYPHS.videographer);
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


describe('card contents stay inside the card', () => {
  // Heebo's natural line box on iOS (~21pt for 14pt text) pushed the skeleton
  // lines out of a fixed-height card. The text line height is pinned, and the
  // card grows to its content rather than clipping or overflowing.
  it('role cards size to their content (min 104pt), never a fixed height', () => {
    const r = render(<AnimatedEmptyState variant="board" {...base} />);
    const card = StyleSheet.flatten(r.getByTestId('role-card-videographer', H).props.style);
    expect(card.height).toBeUndefined();
    expect(card.minHeight).toBe(104);
    expect(card.width).toBe(142);
  });

  it('pins the role name to an explicit line height', () => {
    const r = render(<AnimatedEmptyState variant="board" {...base} />);
    const label = StyleSheet.flatten(r.getByText(labelOf(ROLES.find((x) => x.id === 'editor')!, 'he'), H).props.style);
    expect(label.lineHeight).toBe(16);
  });

  it('centres the ₪ in its pill: a fixed-height box centred both ways, drawn in the system font', () => {
    // Heebo's lopsided ascent/descent drew the ₪ off-centre on iOS.
    const r = render(<AnimatedEmptyState variant="board" {...base} />);
    const symbol = r.getAllByText('₪', H)[0];
    const text = StyleSheet.flatten(symbol.props.style);
    expect(text.fontFamily).toBeUndefined();
    expect(text.textAlign).toBe('center');
    expect(text.includeFontPadding).toBe(false);
    const pill = StyleSheet.flatten(symbol.parent!.parent!.props.style);
    expect(typeof pill.height).toBe('number');
    expect(pill.alignItems).toBe('center');
    expect(pill.justifyContent).toBe('center');
  });
});

it('draws each role glyph large in its 38pt badge (28pt, a 5pt margin all round)', () => {
  const r = render(<AnimatedEmptyState variant="tiles" {...base} />);
  const glyph = StyleSheet.flatten(r.getAllByTestId('glyph', H)[0].props.style);
  expect([glyph.width, glyph.height]).toEqual([28, 28]);
});

describe('the icon squares follow the mode', () => {
  const badgeColors = () =>
    render(<AnimatedEmptyState variant="tiles" {...base} />).getAllByTestId('role-badge', H).map((b) => b.props.colors);

  it('purple for a client', () => {
    mockAccent = '#6D28D9';
    const all = badgeColors();
    expect(all).toHaveLength(6);
    for (const c of all) expect(c[c.length - 1]).toBe('#6D28D9');
  });

  it('blue for a professional', () => {
    mockAccent = '#1D4ED8';
    for (const c of badgeColors()) expect(c[c.length - 1]).toBe('#1D4ED8');
  });
});

describe('smooth motion', () => {
  it('each floating card is drawn once and moved as a bitmap (iOS rasterise, Android hardware texture)', () => {
    const card = render(<AnimatedEmptyState variant="tiles" {...base} />).getByTestId('empty-card-videographer', H);
    expect(card.props.shouldRasterizeIOS).toBe(true);
    expect(card.props.renderToHardwareTextureAndroid).toBe(true);
  });
});

describe('chat bubbles follow the mode too', () => {
  const avatarColors = () =>
    render(<AnimatedEmptyState variant="bubbles" {...base} />).getAllByTestId('bubble-avatar', H).map((a) => a.props.colors);

  it('purple for a client', () => {
    mockAccent = '#6D28D9';
    const all = avatarColors();
    expect(all).toHaveLength(6);
    for (const c of all) expect(c[c.length - 1]).toBe('#6D28D9');
  });

  it('blue for a professional', () => {
    mockAccent = '#1D4ED8';
    for (const c of avatarColors()) expect(c[c.length - 1]).toBe('#1D4ED8');
  });
});

describe('pro mode is blue throughout; client mode keeps its purple', () => {
  const flat = (n: { props: Record<string, unknown> }) => StyleSheet.flatten(n.props.style as never) as Record<string, unknown>;

  it('pro: the ₪ and its pill are blue, and every card is outlined in blue', () => {
    mockAccent = '#1D4ED8';
    const r = render(<AnimatedEmptyState variant="board" {...base} />);
    const symbol = r.getAllByText('₪', H)[0];
    expect(flat(symbol).color).toBe('#1D4ED8');
    expect(flat(symbol.parent!.parent!).backgroundColor).toBe('rgba(29,78,216,0.12)');
    const card = flat(r.getByTestId('role-card-videographer', H));
    expect(card.borderColor).toBe('rgba(59,110,235,0.55)');
  });

  it('pro: the chat bubbles are outlined in blue too', () => {
    mockAccent = '#1D4ED8';
    const r = render(<AnimatedEmptyState variant="bubbles" {...base} />);
    expect(flat(r.getAllByTestId('bubble-card', H)[0]).borderColor).toBe('rgba(59,110,235,0.55)');
  });

  it('client: unchanged — purple ₪ pill, lavender outline', () => {
    mockAccent = '#6D28D9';
    const r = render(<AnimatedEmptyState variant="board" {...base} />);
    const symbol = r.getAllByText('₪', H)[0];
    expect(flat(symbol).color).toBe('#4B34B8');
    expect(flat(symbol.parent!.parent!).backgroundColor).toBe('rgba(110,88,226,0.14)');
    expect(flat(r.getByTestId('role-card-videographer', H)).borderColor).toBe('rgba(165,150,235,0.55)');
  });
});

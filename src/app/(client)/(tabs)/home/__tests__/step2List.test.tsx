import React from 'react';
import { StyleSheet } from 'react-native';
import { render, act } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import HomeScreen from '../index';
import { useUiStore } from '@core/stores/uiStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * STEP 2 AS A ROW LIST.
 *
 * A role is a full-width row: its own mark tinted in a rounded tile, the name
 * over a hint naming what the role covers, and a control at the end — an add
 * pill while empty, a +/count/− stepper once seated. The CTA states the
 * headcount instead of saying "next step".
 *
 * The behavioural invariants (what seats a role, what is inert, what buzzes)
 * live in roleTiles.test.tsx and are unchanged by the redesign. This file is
 * about what the redesign added.
 *
 * NOT COVERED: edit mode's lock on a seat that already holds a professional
 * (`locked` → disabled −, Lock glyph, role_locked_a11y). It needs `filledSlots`,
 * which only loads when a projectId is present, and rendering this screen in
 * edit mode hangs under jest — on the ORIGINAL file too, so it is not something
 * the redesign introduced. That branch is carried over unchanged from the old
 * tile and is verified on device instead.
 */

const ACCENT = '#5B3FE0';
const ROW_BORDER = '#ECE9F5';
const ROW_ON_BG = '#F1EEFF';
const CTA_OFF_BG = '#B9B3D1';
const VIDEOGRAPHER = 'Video Photographer';
const ADD = en.builder.add_role_a11y.replace('{{role}}', 'Videographer');
const REMOVE = en.builder.remove_role_a11y.replace('{{role}}', 'Videographer');
/** The same label when the app is in Hebrew. */
const ADD_HE = he.builder.add_role_a11y.replace('{{role}}', 'צלם וידאו');
const EDITOR = 'Editor';

let mockQuantities: Record<string, number> = {};

jest.mock('@features/crew/hooks', () => ({
  useCrewBuilder: () => ({
    slots: Object.entries(mockQuantities)
      .filter(([, q]) => q > 0)
      .map(([category, quantity]) => ({ category, quantity })),
    totalCount: Object.values(mockQuantities).reduce((a, b) => a + b, 0),
    roleQuantity: (cat: string) => mockQuantities[cat] ?? 0,
    slotCaps: (cat: string) => Array.from({ length: mockQuantities[cat] ?? 0 }, () => undefined),
    setQuantity: jest.fn(),
    setSlotCapability: jest.fn(),
    removeCategory: jest.fn(),
    loadSlots: jest.fn(),
  }),
}));
jest.mock('@features/crew/components', () => ({ MiniCalendar: 'MiniCalendar' }));
// The cards are PressableScale, which pulls in Reanimated.
jest.mock('react-native-reanimated', () => require('../../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('@components/layout/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => mockParams }));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));
let mockLanguage = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLanguage }),
}));
jest.mock('@core/haptics', () => ({
  tapFeedback: jest.fn(), commitFeedback: jest.fn(), warnFeedback: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuantities = {};
  mockParams = {};
  mockLanguage = 'en';
});

function atStepTwo() {
  const r = render(<HomeScreen />);
  act(() => useUiStore.getState().requestBuilderStep(2));
  return r;
}

const flat = (n: ReactTestInstance) => StyleSheet.flatten(n.props.style) as Record<string, unknown>;

/** Any text rendered inside a node. */
function textWithin(n: ReactTestInstance): string {
  let out = '';
  const visit = (node: ReactTestInstance) => node.children.forEach((c) => {
    if (typeof c === 'string') out += c;
    else visit(c);
  });
  visit(n);
  return out.trim();
}

/** How many SVG primitives a node draws — lucide renders RNSVG elements. */
function svgWithin(n: ReactTestInstance): number {
  let count = 0;
  const visit = (node: ReactTestInstance) => {
    if (typeof node.type === 'string' && node.type.startsWith('RNSVG')) count += 1;
    node.children.forEach((c) => typeof c !== 'string' && visit(c));
  };
  visit(n);
  return count;
}

/** Every role row, by the radius-and-border pair only the rows carry. */
function rowStyles(r: ReturnType<typeof render>) {
  const out: { backgroundColor?: string; borderColor?: string; borderWidth?: number }[] = [];
  const visit = (n: ReactTestInstance) => {
    const s = flat(n) as { borderWidth?: number; borderRadius?: number; backgroundColor?: string; borderColor?: string };
    // Host elements only. A row appears twice in the tree — composite and the
    // host it renders to — and the seven unselected rows are identical, so
    // collapsing by value would fold them into one.
    if (typeof n.type === 'string' && s?.borderWidth === 2 && s?.borderRadius === 18) {
      out.push({ backgroundColor: s.backgroundColor, borderColor: s.borderColor, borderWidth: s.borderWidth });
    }
    n.children.forEach((c) => typeof c !== 'string' && visit(c));
  };
  visit(r.root);
  return out;
}

/** Every Image the screen renders, deduped across composite/host layers. */
function glyphs(r: ReturnType<typeof render>) {
  const out: ReactTestInstance[] = [];
  const visit = (n: ReactTestInstance) => {
    const s = flat(n);
    if (s?.width === 28 && s?.height === 28) out.push(n);
    n.children.forEach((c) => typeof c !== 'string' && visit(c));
  };
  visit(r.root);
  // A node appears as both composite and host; keep one per tintColor position.
  return out.filter((n, i) => i === 0 || out[i - 1].props.tintColor !== n.props.tintColor
    || out[i - 1] !== n.children[0]);
}

describe('a role row', () => {
  it('offers the add pill while empty, and no stepper', () => {
    const r = atStepTwo();

    expect(r.getAllByText(en.builder.add_role).length).toBe(8);
    expect(r.queryByText('+')).toBeNull();
    expect(r.queryByText('−')).toBeNull();
  });

  it('swaps the pill for a stepper once seated', () => {
    mockQuantities[VIDEOGRAPHER] = 2;
    const r = atStepTwo();

    // Seven roles are still empty, so seven pills remain — not eight.
    expect(r.getAllByText(en.builder.add_role).length).toBe(7);
    expect(r.getByLabelText(ADD)).toBeTruthy();
    expect(r.getByLabelText(REMOVE)).toBeTruthy();
    expect(r.getByText('2')).toBeTruthy();
  });

  it('carries the role name alone — no description under it', () => {
    const r = atStepTwo();

    // The row briefly had a line of specializations under the name. Nothing
    // from that vocabulary should render now.
    expect(r.getByText('Videographer')).toBeTruthy();
    expect(r.queryByText(/Events, Ads & Brands/)).toBeNull();
    expect(r.queryByText(/Brand Identity/)).toBeNull();
    expect(r.queryByText(/General/)).toBeNull();
  });

  it('keeps the role name to one line', () => {
    const r = atStepTwo();

    const name = r.getByText('Stills Photographer');
    expect(name.props.numberOfLines).toBe(1);
    expect(name.props.ellipsizeMode).toBe('tail');
  });

  it('draws + and − as icons, not text glyphs', () => {
    mockQuantities[VIDEOGRAPHER] = 1;
    const r = atStepTwo();

    // They were <Text>, nudged down by an eyeballed 2pt to sit centred. A font
    // glyph sits on the font's math axis, which the web and a phone place
    // differently inside the line box — so it centred on one and not the other.
    // An SVG has no metrics to disagree about.
    for (const label of [ADD, REMOVE]) {
      expect(textWithin(r.getByLabelText(label))).toBe('');
      expect(svgWithin(r.getByLabelText(label))).toBeGreaterThan(0);
    }
  });

  it('switches the row fill and border when it is seated', () => {
    mockQuantities[VIDEOGRAPHER] = 1;
    const r = atStepTwo();

    const rows = rowStyles(r);
    const on = rows.filter((x) => x.backgroundColor === ROW_ON_BG);
    const off = rows.filter((x) => x.backgroundColor === '#FFFFFF');
    expect(on).toHaveLength(1);
    expect(off).toHaveLength(7);
    expect(on[0].borderColor).toBe(ACCENT);
    expect(off[0].borderColor).toBe(ROW_BORDER);
    // Same border width either way, or selecting a row would nudge the list.
    expect(on[0].borderWidth).toBe(off[0].borderWidth);
  });

  it('tints the mark accent while empty and white once seated', () => {
    mockQuantities[VIDEOGRAPHER] = 1;
    const r = atStepTwo();

    const tints = glyphs(r).map((g) => g.props.tintColor);
    expect(tints).toContain('#FFFFFF');
    expect(tints).toContain(ACCENT);
    // Exactly one role is seated, so exactly one mark is white.
    expect(tints.filter((t) => t === '#FFFFFF')).toHaveLength(1);
  });

});

describe('the CTA', () => {
  it('asks for at least one, and is greyed but NOT announced disabled', () => {
    const r = atStepTwo();
    const cta = r.getByTestId('step2-cta');

    expect(r.getByText(en.builder.pick_at_least_one)).toBeTruthy();
    expect(flat(cta).backgroundColor).toBe(CTA_OFF_BG);
    // It is pressable — pressing is how the error is raised — so saying
    // "disabled" would tell a screen reader the opposite of the truth.
    expect(cta.props.accessibilityState?.disabled).toBeUndefined();
    expect(cta.props.disabled).toBeFalsy();
  });

  it('states the headcount once roles are picked, and undims', () => {
    mockQuantities[VIDEOGRAPHER] = 2;
    mockQuantities[EDITOR] = 1;
    const r = atStepTwo();

    expect(r.getByText('Continue · 3 professionals')).toBeTruthy();
    expect(flat(r.getByTestId('step2-cta')).backgroundColor).toBe(ACCENT);
  });

  it('says "1 professional", not "1 professionals"', () => {
    mockQuantities[EDITOR] = 1;
    const r = atStepTwo();

    expect(r.getByText(en.builder.continue_with_count_one)).toBeTruthy();
  });
});

describe('in Hebrew', () => {
  it('fills the count into the CTA', () => {
    mockLanguage = 'he';
    mockQuantities[VIDEOGRAPHER] = 2;
    const r = atStepTwo();

    // {{count}} resolved — the screen's own t() had no interpolation before
    // this step needed it.
    expect(r.getByText('המשך · 2 אנשי מקצוע')).toBeTruthy();
    expect(r.queryByText(/\{\{/)).toBeNull();
  });

  it('writes the role names in Hebrew', () => {
    mockLanguage = 'he';
    const r = atStepTwo();

    expect(r.getByText('צלם וידאו')).toBeTruthy();
    expect(r.getByText('אולפן הקלטות')).toBeTruthy();
    expect(r.queryByText('אירועים, פרסומות ומותגים')).toBeNull();
  });

  it('mirrors the stepper so + is on the trailing side', () => {
    mockLanguage = 'he';
    mockQuantities[VIDEOGRAPHER] = 1;
    const r = atStepTwo();

    const plus = r.getByLabelText(ADD_HE);
    // The stepper row is the plus's nearest ancestor with a flexDirection.
    let node: ReactTestInstance | null = plus.parent;
    let dir: unknown;
    while (node && dir === undefined) {
      dir = flat(node)?.flexDirection;
      node = node.parent;
    }
    expect(dir).toBe('row-reverse');
  });
});

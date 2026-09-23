import React from 'react';
import { StyleSheet } from 'react-native';
import { render, act } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import HomeScreen from '../index';
import { useUiStore } from '@core/stores/uiStore';
import en from '@core/i18n/translations/en.json';

/**
 * STEP 2 AS A CARD GRID.
 *
 * A role is a flat card: its own mark tinted in a rounded tile, the name, and a
 * control — an add pill while empty, a +/count/− stepper once seated. A tray
 * above the grid names the team so far, and the CTA states the headcount
 * instead of saying "next step".
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

const ACCENT = '#4A33D1';
const VIDEOGRAPHER = 'Video Photographer';
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

/** Every Image the screen renders, deduped across composite/host layers. */
function glyphs(r: ReturnType<typeof render>) {
  const out: ReactTestInstance[] = [];
  const visit = (n: ReactTestInstance) => {
    const s = flat(n);
    if (s?.width === 26 && s?.height === 26) out.push(n);
    n.children.forEach((c) => typeof c !== 'string' && visit(c));
  };
  visit(r.root);
  // A node appears as both composite and host; keep one per tintColor position.
  return out.filter((n, i) => i === 0 || out[i - 1].props.tintColor !== n.props.tintColor
    || out[i - 1] !== n.children[0]);
}

describe('the team tray', () => {
  it('is not there at all until something is picked', () => {
    const r = atStepTwo();
    // Heading included: an empty tray would be a title over nothing, and the
    // grid underneath already says what there is to pick.
    expect(r.queryByText(en.builder.team_so_far)).toBeNull();
  });

  it('appears as soon as one seat is taken', () => {
    mockQuantities[VIDEOGRAPHER] = 1;
    const r = atStepTwo();

    expect(r.getByText(en.builder.team_so_far)).toBeTruthy();
  });

  it('names a single seat plainly, with no count in front of it', () => {
    mockQuantities[VIDEOGRAPHER] = 1;
    const r = atStepTwo();

    // Two matches: the card's own name and the chip. Both are the bare label.
    expect(r.getAllByText('Videographer').length).toBe(2);
  });

  it('puts the count in front once a role holds more than one', () => {
    mockQuantities[VIDEOGRAPHER] = 3;
    const r = atStepTwo();

    expect(r.getByText('3 × Videographer')).toBeTruthy();
    // The card still carries the bare name; only the chip counts.
    expect(r.getAllByText('Videographer').length).toBe(1);
  });

  it('gives each role its own chip', () => {
    mockQuantities[VIDEOGRAPHER] = 2;
    mockQuantities[EDITOR] = 1;
    const r = atStepTwo();

    expect(r.getByText('2 × Videographer')).toBeTruthy();
    expect(r.getAllByText('Editor').length).toBe(2);
  });
});

describe('a role card', () => {
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
    expect(r.getByText('+')).toBeTruthy();
    expect(r.getByText('−')).toBeTruthy();
    expect(r.getByText('2')).toBeTruthy();
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
  it('asks for at least one, and is dimmed but NOT announced disabled', () => {
    const r = atStepTwo();
    const cta = r.getByTestId('step2-cta');

    expect(r.getByText(en.builder.pick_at_least_one)).toBeTruthy();
    expect(flat(cta).opacity).toBe(0.5);
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
    expect(flat(r.getByTestId('step2-cta')).opacity).toBeUndefined();
  });

  it('says "1 professional", not "1 professionals"', () => {
    mockQuantities[EDITOR] = 1;
    const r = atStepTwo();

    expect(r.getByText(en.builder.continue_with_count_one)).toBeTruthy();
  });
});

describe('in Hebrew', () => {
  it('fills the count into both the chip and the CTA', () => {
    mockLanguage = 'he';
    mockQuantities[VIDEOGRAPHER] = 2;
    const r = atStepTwo();

    // {{count}} and {{role}} both resolved — the screen's own t() had no
    // interpolation before this step needed it.
    expect(r.getByText('2 × צלם וידאו')).toBeTruthy();
    expect(r.getByText('המשך · 2 אנשי מקצוע')).toBeTruthy();
    expect(r.queryByText(/\{\{/)).toBeNull();
  });

  it('mirrors the stepper so + is on the trailing side', () => {
    mockLanguage = 'he';
    mockQuantities[VIDEOGRAPHER] = 1;
    const r = atStepTwo();

    const plus = r.getByText('+');
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
